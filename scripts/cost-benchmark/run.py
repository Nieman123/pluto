"""Compare the two isolated, authenticated staging health-audit functions."""
import argparse, json, subprocess, time, uuid, urllib.request
from pathlib import Path
from datetime import datetime, timezone
parser=argparse.ArgumentParser()
parser.add_argument('--gcloud',required=True)
parser.add_argument('--samples',type=int,default=25)
args=parser.parse_args()
if not 5<=args.samples<=50: raise ValueError('Choose 5..50 samples.')
access=subprocess.check_output([args.gcloud,'auth','print-access-token'],text=True).strip()
identity=subprocess.check_output([args.gcloud,'auth','print-identity-token'],text=True).strip()
def request(url,token,body=None):
    req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},
      data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req,timeout=150) as response: return json.load(response)
run=uuid.uuid4().hex
report={'runId':run,'project':'pluto-staging-92eb7','startedAt':datetime.now(timezone.utc).isoformat(),'samples':{},'configuration':{},'cleanup':{},
  'scope':'Actual collectHealth code; 50 synthetic paid orders and tickets in a separate Firestore path. No provider calls. Setup latency is first-request latency, not a guaranteed cold start.'}
urls={}
try:
    for label,suffix in [('full','Full'),('fractional','Fractional')]:
        name='costHealthBenchmark'+suffix
        config=request(f'https://cloudfunctions.googleapis.com/v2/projects/pluto-staging-92eb7/locations/us-central1/functions/{name}',access)
        if config.get('state')!='ACTIVE': raise RuntimeError('Benchmark function is not active.')
        urls[label]=config['serviceConfig']['uri']
        report['configuration'][label]={k:config['serviceConfig'].get(k) for k in ['availableCpu','availableMemory','maxInstanceCount','maxInstanceRequestConcurrency']}
        started=time.perf_counter();request(urls[label],identity,{'runId':run,'action':'setup'})
        report['configuration'][label]['firstRequestMs']=(time.perf_counter()-started)*1000
        report['samples'][label]=[]
    for i in range(args.samples):
        for label in (['full','fractional'] if i%2==0 else ['fractional','full']):
            started=time.perf_counter()
            sample=request(urls[label],identity,{'runId':run,'action':'audit'})
            sample['requestMs']=(time.perf_counter()-started)*1000
            if sample['checkedPaidOrders']!=50 or sample['critical']: raise RuntimeError('Audit integrity check failed.')
            report['samples'][label].append(sample)
        print(f'Completed comparison {i+1}/{args.samples}',flush=True)
finally:
    for label,url in urls.items():
        try: report['cleanup'][label]=request(url,identity,{'runId':run,'action':'cleanup'})
        except Exception as error: report['cleanup'][label]={'error':str(error)}
    report['completedAt']=datetime.now(timezone.utc).isoformat()
    report['summary']={}
    for label,samples in report['samples'].items():
        if not samples: continue
        durations=sorted(s['elapsedMs'] for s in samples)
        cpu=float(report['configuration'][label]['availableCpu'])
        report['summary'][label]={'audits':len(samples),'medianMs':durations[len(durations)//2],
          'p95Ms':durations[min(len(durations)-1,int(len(durations)*.95))],
          'maxRssMiB':max(s['rssBytes'] for s in samples)/1048576,
          'modeledAllocatedCpuSeconds':sum(durations)*cpu/1000}
    Path('tmp/cost-cpu-benchmark-result.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report['summary'],indent=2))
    if any(not v.get('removed') for v in report['cleanup'].values()): raise RuntimeError('Benchmark cleanup incomplete.')
