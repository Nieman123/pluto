"""Portable export of actual run.json observations. Requires matplotlib."""
import argparse
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

parser = argparse.ArgumentParser()
parser.add_argument('reports', nargs='+')
parser.add_argument('--output', required=True)
args = parser.parse_args()
runs = [json.loads(Path(p).read_text(encoding='utf-8')) for p in args.reports]
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11, 'figure.facecolor': '#14101b',
    'axes.facecolor': '#14101b', 'axes.edgecolor': '#786385', 'text.color': '#f6efff',
    'axes.labelcolor': '#e2d4ee', 'xtick.color': '#c6b5d7', 'ytick.color': '#c6b5d7', 'grid.color': '#483653'})
fig, axes = plt.subplots(2, 2, figsize=(13, 9))
colors = ['#66d0db', '#ffad51', '#b895fa', '#99d59a']
sizes = sorted(set(p['attendees'] for r in runs for p in r['phases'] if p.get('attendees')))
for ri, run in enumerate(runs):
    independent = run['workload'].get('scannerSessions', 'shared session') != 'shared session'
    style = '-' if independent else '--'
    for si, size in enumerate(sizes):
        points = sorted([p for p in run['phases'] if p['name'] == 'admission' and p.get('attendees') == size], key=lambda p:p['concurrency'])
        if not points:
            continue
        label = '{:,} / {}'.format(size, 'separate sessions' if independent else 'shared session')
        axes[0, 0].plot([p['concurrency'] for p in points], [p['p95Ms']/1000 for p in points], style, marker='o', color=colors[si], label=label)
        axes[0, 1].plot([p['concurrency'] for p in points], [p['successfulRps'] for p in points], style, marker='o', color=colors[si], label=label)
    inv = sorted([p for p in run['phases'] if p['name'] == 'inventory-core'], key=lambda p:p['concurrency'])
    if inv:
        axes[1, 0].plot([p['concurrency'] for p in inv], [p['p95Ms']/1000 for p in inv], '-o', color='#b895fa')
    manifest = sorted([p for p in run['phases'] if p['name'] == 'manifest'], key=lambda p:p['attendees'])
    if manifest:
        axes[1, 1].plot([p['attendees'] for p in manifest], [p['p95Ms']/1000 for p in manifest], style, marker='o', color=colors[ri], label='Separate sessions run' if independent else 'Shared session run')
titles = ['Scanner response · 95th percentile', 'Successful admission throughput', 'Inventory diagnostic · client → Firestore over WAN', 'Offline manifest · full download and parse']
for ax, title in zip(axes.flat, titles):
    ax.set_title(title, loc='left', pad=14, fontsize=12, color='#f6efff')
    ax.grid(True, alpha=.4); ax.set_ylim(bottom=0); ax.spines['top'].set_visible(False); ax.spines['right'].set_visible(False)
axes[0, 0].set(xlabel='Concurrent scan requests', ylabel='p95 response time (seconds)')
axes[0, 1].set(xlabel='Concurrent scan requests', ylabel='Successful scans / second')
axes[1, 0].set(xlabel='Concurrent reservations', ylabel='p95 response time (seconds)')
axes[1, 1].set(xlabel='Stored attendees / tickets', ylabel='p95 response time (seconds)')
axes[0, 0].legend(fontsize=8, frameon=False); axes[1, 1].legend(fontsize=8, frameon=False)
fig.suptitle('PLUTO EVENTS  |  Measured staging performance', x=.065, ha='left', fontsize=19, color='#ffad51')
fig.text(.065, .018, 'Observed closed-loop workloads. Inventory excludes HTTP/auth/payment providers. Scanner measurements use deployed HTTPS API.\nNo card charges or email delivery. These tests do not establish a maximum festival size.', fontsize=10, color='#c6b5d7')
fig.tight_layout(rect=[.03, .075, .99, .94], h_pad=2.5, w_pad=2)
target = Path(args.output); target.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(str(target), dpi=160, facecolor=fig.get_facecolor())
fig.savefig(str(target.with_suffix('.svg')), facecolor=fig.get_facecolor())
print(str(target.resolve()))
