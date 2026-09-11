export async function boundedResponse(response: Response, maximum: number): Promise<string> {
  if (Number(response.headers.get('content-length')) > maximum) { await response.body?.cancel(); throw new Error('Remote response exceeds its size limit.') }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Remote response is empty.')
  const chunks: Uint8Array[] = []; let size = 0
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > maximum) throw new Error('Remote response exceeds its size limit.'); chunks.push(part.value) }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
