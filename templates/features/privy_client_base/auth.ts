export function createPrivyAuthHeader(appId: string, appSecret: string): string {
  const encoded = Buffer.from(appId + ':' + appSecret).toString('base64');
  return 'Basic ' + encoded;
}
