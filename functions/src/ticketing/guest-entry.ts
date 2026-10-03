export function guestEntry(id: string, data: any) {
  return { id, name: data.name as string, note: data.note as string || '', version: data.version as number,
    arrived: data.arrival ? { at: data.arrival.at as number, label: data.arrival.scannerLabel as string || 'Event staff', offline: data.arrival.offline === true } : null };
}
