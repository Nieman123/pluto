"""Idempotent, alerts-only budgets and function-build retention. Defaults to plan.

Authenticate with gcloud first. Run with --apply to persist the displayed controls.
Does not change runtimes, billing enablement, unrelated budgets or repositories.
"""
import argparse
import json
import shutil
import subprocess
import urllib.request
import urllib.error
import time
from pathlib import Path

PROJECTS = {'pluto-9b6ca': ('production', 50), 'pluto-staging-92eb7': ('staging', 20)}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--gcloud', default=shutil.which('gcloud') or shutil.which('gcloud.cmd'))
    args = parser.parse_args()
    if not args.gcloud:
        parser.error('gcloud is required; pass its path with --gcloud.')
    token = subprocess.check_output([args.gcloud, 'auth', 'print-access-token'], text=True).strip()
    def api(url, method='GET', body=None):
        request = urllib.request.Request(url, method=method,
            headers={'Authorization': 'Bearer ' + token, 'x-goog-user-project': 'pluto-9b6ca', 'Content-Type': 'application/json'},
            data=json.dumps(body).encode() if body is not None else None)
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=60) as response: return json.load(response)
            except urllib.error.HTTPError as error:
                detail = json.loads(error.read()).get('error', {})
                if (error.code == 429 or 'rate' in detail.get('message', '').lower()) and attempt < 3:
                    time.sleep(15); continue
                raise RuntimeError(f'{error.code}: {detail.get("message", "API request failed")}') from None
    results = []
    for project, (environment, amount) in PROJECTS.items():
        info = api(f'https://cloudbilling.googleapis.com/v1/projects/{project}/billingInfo')
        if not info.get('billingEnabled'): raise RuntimeError(f'Billing is not enabled: {project}')
        number = api(f'https://cloudresourcemanager.googleapis.com/v1/projects/{project}')['projectNumber']
        base = f'https://billingbudgets.googleapis.com/v1/{info["billingAccountName"]}/budgets'
        budgets, page_token = [], ''
        while True:
            page = api(base + '?pageSize=100' + ('&pageToken=' + page_token if page_token else ''))
            budgets.extend(page.get('budgets', []))
            page_token = page.get('nextPageToken', '')
            if not page_token: break
        name = f'Pluto {environment} monthly alert'
        matches = [b for b in budgets if b['displayName'] == name]
        if len(matches) > 1: raise RuntimeError(f'Ambiguous budget name: {name}')
        old = matches[0] if matches else None
        if old and (old.get('spendCap') or old.get('budgetFilter', {}).get('projects') != [f'projects/{number}']):
            raise RuntimeError('Existing budget has a different scope or spend cap; refusing to replace it.')
        body = {'displayName': name,
          'budgetFilter': {'projects': [f'projects/{number}'], 'calendarPeriod': 'MONTH', 'creditTypesTreatment': 'INCLUDE_ALL_CREDITS'},
          'amount': {'specifiedAmount': {'currencyCode': 'USD', 'units': str(amount)}},
          'thresholdRules': [{'thresholdPercent': p, 'spendBasis': 'CURRENT_SPEND'} for p in [0.5, 0.9, 1]] +
                            [{'thresholdPercent': 1, 'spendBasis': 'FORECASTED_SPEND'}],
          'notificationsRule': {'disableDefaultIamRecipients': False}}
        print(json.dumps({'project': project, 'budget': body, 'apply': args.apply}))
        if args.apply:
            if old:
                body.update({'name': old['name'], 'etag': old['etag']})
                # Preserve any custom notifications on the managed budget.
                body['notificationsRule'] = {**old.get('notificationsRule', {}), **body['notificationsRule']}
                saved = api('https://billingbudgets.googleapis.com/v1/' + old['name'] +
                  '?updateMask=displayName,budgetFilter,amount,thresholdRules,notificationsRule', 'PATCH', body)
            else: saved = api(base, 'POST', body)
            verified = api('https://billingbudgets.googleapis.com/v1/' + saved['name'])
            if verified.get('spendCap') or verified['amount'] != body['amount'] or verified['thresholdRules'] != body['thresholdRules']:
                raise RuntimeError('Budget verification failed.')
            results.append({'project': project, 'budget': verified})
        resource = f'projects/{project}/locations/us-central1/repositories/gcf-artifacts'
        url = 'https://artifactregistry.googleapis.com/v1/' + resource
        repo = api(url)
        if repo.get('cleanupPolicyDryRun'): raise RuntimeError('Repository is in dry-run mode; review its existing policies first.')
        policies = dict(repo.get('cleanupPolicies', {}))
        policies['pluto-build-retention'] = {'id': 'pluto-build-retention', 'action': 'DELETE',
            'condition': {'tagState': 'ANY', 'olderThan': '604800s'}}
        print(json.dumps({'project': project, 'artifactRetentionDays': 7, 'apply': args.apply}))
        if args.apply:
            api(url + '?updateMask=cleanupPolicies', 'PATCH', {'name': resource, 'cleanupPolicies': policies})
            verified = api(url)
            if verified.get('cleanupPolicies', {}).get('pluto-build-retention') != policies['pluto-build-retention']:
                raise RuntimeError('Artifact retention verification failed.')
            results[-1]['artifactRetentionDays'] = 7
    if args.apply:
        Path('tmp').mkdir(exist_ok=True)
        Path('tmp/cost-controls-applied.json').write_text(json.dumps(results, indent=2) + '\n')

if __name__ == '__main__': main()
