import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const STORAGE_BUCKET = 'post-media'

// GET /api/free-form/media/[id] — return fresh signed URL
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: record, error } = await supabase
    .from('free_form_media')
    .select('storage_path, file_name, media_type, linkedin_caption')
    .eq('id', params.id)
    .single()

  if (error || !record) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: signedUrl } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(record.storage_path, 3600)

  return NextResponse.json({
    signedUrl:       signedUrl?.signedUrl ?? null,
    fileName:        record.file_name,
    mediaType:       record.media_type,
    linkedinCaption: record.linkedin_caption,
  })
}

// PATCH /api/free-form/media/[id] — update linkedin_caption
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { linkedinCaption } = await req.json() as { linkedinCaption: string }

  const { error } = await supabase
    .from('free_form_media')
    .update({ linkedin_caption: linkedinCaption, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ saved: true })
}

// DELETE /api/free-form/media/[id] — remove media record + Storage file
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: record, error: fetchError } = await supabase
    .from('free_form_media')
    .select('id, storage_path')
    .eq('id', params.id)
    .single()

  if (fetchError || !record) return NextResponse.json({ error: 'Media record not found' }, { status: 404 })

  await supabase.storage.from(STORAGE_BUCKET).remove([record.storage_path])

  const { error: delError } = await supabase.from('free_form_media').delete().eq('id', params.id)

  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
