// pages/api/songs.ts (Next.js API Route)
import type { NextApiRequest, NextApiResponse } from 'next'

const BASE = 'https://api.jsonstorage.net/v1/json'

// 環境変数に設定しておく：
// - JSONSTORAGE_DOCUMENT_ID（最初は空でもOK。空なら自動で作成してログに出します）
// - JSONSTORAGE_API_KEY（必要な場合のみ。未使用なら空でOK）
const DOCUMENT_ID = process.env.JSONSTORAGE_DOCUMENT_ID || ''
const API_KEY = process.env.JSONSTORAGE_API_KEY || ''

async function getDocId(): Promise<string> {
  if (DOCUMENT_ID) return DOCUMENT_ID

  // まだIDがなければ新規作成（空配列で初期化）
  const resp = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'apiKey': API_KEY } : {}),
    },
    body: JSON.stringify([]),
  })
  if (!resp.ok) {
    const t = await resp.text()
    throw new Error(`jsonstorage POST failed: ${resp.status} - ${t}`)
  }
  const data = await resp.json() as { uri?: string, id?: string }
  // 仕様により返却形式が uri だったり id だったりするケースがあるため両対応
  const idFromUri = data?.uri?.split('/').pop()
  const id = data?.id || idFromUri
  if (!id) throw new Error('jsonstorage: could not parse created document id')

  // ーー重要ーー
  // ここで返ってきたIDを Vercel の環境変数 JSONSTORAGE_DOCUMENT_ID に設定してください（手動）
  // （実行時に環境変数を書き換えることはできないため）
  console.log('[jsonstorage] Created new document. Set JSONSTORAGE_DOCUMENT_ID to:', id)
  return id
}

function cors(res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const id = await getDocId()

    if (req.method === 'GET') {
      const r = await fetch(`${BASE}/${id}`, {
        headers: { ...(API_KEY ? { 'apiKey': API_KEY } : {}) },
      })
      if (r.status === 404) {
        // 万一消えていたら再作成
        const created = await fetch(BASE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(API_KEY ? { 'apiKey': API_KEY } : {}),
          },
          body: JSON.stringify([]),
        })
        if (!created.ok) {
          const tt = await created.text()
          throw new Error(`jsonstorage recreate failed: ${created.status} - ${tt}`)
        }
        const data = await created.json()
        return res.status(200).json([])
      }
      const data = await r.json()
      return res.status(200).json(data)
    }

    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? [])
      // 直接PUT（存在しない場合は404になるので、そのときはPOSTで作り直す）
      let r = await fetch(`${BASE}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(API_KEY ? { 'apiKey': API_KEY } : {}),
        },
        body,
      })

      if (r.status === 404) {
        // 作り直し
        const created = await fetch(BASE, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(API_KEY ? { 'apiKey': API_KEY } : {}),
          },
          body,
        })
        if (!created.ok) {
          const tt = await created.text()
          throw new Error(`jsonstorage POST after 404 failed: ${created.status} - ${tt}`)
        }
        r = created
      }

      if (!r.ok) {
        const t = await r.text()
        throw new Error(`jsonstorage PUT/POST failed: ${r.status} - ${t}`)
      }
      const data = await r.json().catch(() => ({}))
      return res.status(200).json(data)
    }

    return res.status(405).json({ error: 'Method Not Allowed' })
  } catch (err: any) {
    console.error(err)
    return res.status(500).json({ error: err?.message || 'Internal Error' })
  }
}