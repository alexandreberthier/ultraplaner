export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota exceeded') ||
    msg.includes('Total timeout of API')
  )
}

export async function withFirestoreRetry<T>(
  fn: () => Promise<T>,
  label = 'firestore'
): Promise<T> {
  const maxRetries = 20

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isQuotaError(err) || attempt === maxRetries - 1) throw err
      // Aggressive backoff for daily/rate quotas (up to 15 min)
      const waitSec = Math.min(900, 45 * 2 ** Math.min(attempt, 4))
      process.stdout.write(`\n[import] ${label} Quota — warte ${waitSec}s… `)
      await sleep(waitSec * 1000)
    }
  }

  throw new Error(`${label}: Retries erschöpft`)
}
