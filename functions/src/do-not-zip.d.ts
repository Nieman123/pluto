declare module 'do-not-zip' {
  export function toBuffer(files: { path: string; data: Buffer | string }[]): Buffer;
}
