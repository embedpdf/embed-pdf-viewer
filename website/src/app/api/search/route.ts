import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const MODEL = 'openai/text-embedding-3-small'

interface EmbeddingDoc {
  path: string
  title: string
  description: string
  url: string
  framework: string | null
  section: string | null
  embedding: number[]
}

interface EmbeddingsData {
  model: string
  generatedAt: string
  docs: EmbeddingDoc[]
}

let cachedData: EmbeddingsData | null = null

function getEmbeddingsData(): EmbeddingsData {
  if (!cachedData) {
    try {
      const filePath = join(process.cwd(), 'src/data/embeddings.json')
      cachedData = JSON.parse(readFileSync(filePath, 'utf-8'))
    } catch {
      cachedData = { model: MODEL, generatedAt: '', docs: [] }
    }
  }
  return cachedData
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

async function embedQuery(query: string): Promise<number[]> {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.embedpdf.com',
      'X-Title': 'EmbedPDF Docs',
    },
    body: JSON.stringify({
      input: query,
      model: MODEL,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter API error (${response.status}): ${error}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

async function search(
  query: string,
  options: { framework?: string; section?: string; limit: number },
) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured')
  }

  const data = getEmbeddingsData()

  if (data.docs.length === 0) {
    throw new Error('Embeddings not yet generated')
  }

  const queryEmbedding = await embedQuery(query)

  let docs = data.docs

  if (options.framework) {
    docs = docs.filter((d) => d.framework === options.framework)
  }
  if (options.section) {
    docs = docs.filter((d) => d.section === options.section)
  }

  const scored = docs.map((doc) => ({
    path: doc.path,
    title: doc.title,
    description: doc.description,
    url: doc.url,
    framework: doc.framework,
    section: doc.section,
    score:
      Math.round(cosineSimilarity(queryEmbedding, doc.embedding) * 1000) /
      1000,
  }))

  scored.sort((a, b) => b.score - a.score)

  const filtered = scored.filter(r => r.score >= 0.25)

  return {
    query,
    total: filtered.slice(0, options.limit).length,
    results: filtered.slice(0, options.limit),
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const query = searchParams.get('q')
    const framework = searchParams.get('framework') ?? undefined
    const section = searchParams.get('section') ?? undefined
    const limit = parseInt(searchParams.get('limit') ?? '10', 10)

    if (!query) {
      return NextResponse.json(
        { error: 'Missing required query parameter: q' },
        { status: 400 },
      )
    }

    const results = await search(query, { framework, section, limit })
    return NextResponse.json(results)
  } catch (error) {
    console.error('Search API error:', error)
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    const status = message.includes('not configured')
      ? 503
      : message.includes('not yet generated')
        ? 503
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, framework, section, limit = 10 } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid query parameter' },
        { status: 400 },
      )
    }

    const results = await search(query, { framework, section, limit })
    return NextResponse.json(results)
  } catch (error) {
    console.error('Search API error:', error)
    const message =
      error instanceof Error ? error.message : 'Internal server error'
    const status = message.includes('not configured')
      ? 503
      : message.includes('not yet generated')
        ? 503
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
