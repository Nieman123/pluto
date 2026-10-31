"""Collect Cloud Monitoring evidence and remove only our two staging benchmark functions."""
import argparse,json,subprocess,time,urllib.request,urllib.parse,urllib.error
from pathlib import Path
from datetime import datetime,timedelta,timezone
p=argparse.ArgumentParser();p.add_argument('--gcloud',required=True);args=p.parse_args()
token=subprocess.check_output([args.gcloud,'auth','print-access-token'],text=True).strip()
def api(url,method='GET'):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,method=method,headers={'Authorization':'Bearer '+token}),timeout=60) as r:return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code==404 and method=='GET':return None
        raise RuntimeError(f'{e.code}: '+json.loads(e.read()).get('error',{}).get('message','API request failed')) from None
project='pluto-staging-92eb7';base=f'https://cloudfunctions.googleapis.com/v2/projects/{project}/locations/us-central1/functions'
result=json.loads(Path('tmp/cost-cpu-benchmark-result.json').read_text())
if result['project']!=project or not all(v.get('removed') for v in result['cleanup'].values()):raise RuntimeError('Verify synthetic data cleanup first.')
result['cloudMetrics']={}
start=datetime.fromisoformat(result['startedAt'])-timedelta(minutes=5)
end=min(datetime.now(timezone.utc),datetime.fromisoformat(result['completedAt'])+timedelta(minutes=5))
for label,suffix in [('full','Full'),('fractional','Fractional')]:
    name='costHealthBenchmark'+suffix
    fn=api(base+'/'+name)
    if fn:
        if fn.get('eventTrigger') or fn['serviceConfig'].get('maxInstanceCount')!=1:raise RuntimeError('Unexpected benchmark configuration; refusing cleanup.')
        operation=api(base+'/'+name,'DELETE')
        for attempt in range(100):
            state=api('https://cloudfunctions.googleapis.com/v2/'+operation['name'])
            if state.get('error'):raise RuntimeError('Benchmark deletion failed.')
            if state.get('done'):break
            time.sleep(3)
        if api(base+'/'+name):raise RuntimeError('Benchmark function remains.')
    result['cleanup'][label]['functionRemoved']=True
    metrics={}
    for metric,aligner in [('container/billable_instance_time','ALIGN_SUM'),('request_count','ALIGN_SUM'),
                            ('container/startup_latencies','ALIGN_PERCENTILE_95'),('container/memory/utilizations','ALIGN_PERCENTILE_95')]:
        params={'filter':f'metric.type="run.googleapis.com/{metric}" AND resource.type="cloud_run_revision" AND resource.labels.service_name="{name.lower()}"',
          'interval.startTime':start.isoformat(),'interval.endTime':end.isoformat(),
          'aggregation.alignmentPeriod':'600s','aggregation.perSeriesAligner':aligner,'pageSize':1000}
        data=api(f'https://monitoring.googleapis.com/v3/projects/{project}/timeSeries?'+urllib.parse.urlencode(params))
        metrics[metric]=data
    result['cloudMetrics'][label]=metrics
result['cloudMetricsCollectedAt']=datetime.now(timezone.utc).isoformat()
result['cloudMetricsComplete']=all(sum(int(point['value'].get('int64Value',0))
  for series in metrics['request_count'].get('timeSeries',[]) for point in series.get('points',[]))==len(result['samples'][label])+2
  for label,metrics in result['cloudMetrics'].items())
Path('tmp/cost-cpu-benchmark-result.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'cleanup':result['cleanup'],'cloudMetricsComplete':result['cloudMetricsComplete'],'cloudMetricSeries':{label:{key:len(value.get('timeSeries',[])) for key,value in metrics.items()} for label,metrics in result['cloudMetrics'].items()}},indent=2))
