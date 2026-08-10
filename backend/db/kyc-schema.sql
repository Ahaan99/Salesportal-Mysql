-- KYC Submissions & Documents Schema
    -- Run this in your Supabase SQL editor

    -- ── KYC Submissions ──────────────────────────────────────────────────────────
    create table if not exists public.kyc_submissions (
    id                uuid        primary key default gen_random_uuid(),
    user_id           uuid        not null references auth.users(id) on delete cascade,
    user_role         text        not null check (user_role in ('field','client')),
    status            text        not null default 'draft'
                      check (status in ('draft','pending','approved','rejected')),
    submitted_at      timestamptz,
    reviewed_at       timestamptz,
    reviewed_by       uuid        references auth.users(id) on delete set null,
    rejection_reason  text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (user_id)
    );

    create index if not exists idx_kyc_submissions_user_id on public.kyc_submissions(user_id);
    create index if not exists idx_kyc_submissions_status  on public.kyc_submissions(status);

    -- ── KYC Documents ────────────────────────────────────────────────────────────
    create table if not exists public.kyc_documents (
    id             uuid        primary key default gen_random_uuid(),
    submission_id  uuid        not null references public.kyc_submissions(id) on delete cascade,
    user_id        uuid        not null references auth.users(id) on delete cascade,
    doc_type       text        not null
                   check (doc_type in (
                     'pan','driving_license','passport','voter_id',
                     'gst','bank_statement','shop_photo'
                   )),
    storage_path   text        not null,
    file_name      text        not null,
    file_size      bigint      not null,
    mime_type      text        not null,
    uploaded_at    timestamptz not null default now(),
    unique (submission_id, doc_type)
    );

    create index if not exists idx_kyc_documents_submission on public.kyc_documents(submission_id);
    create index if not exists idx_kyc_documents_user       on public.kyc_documents(user_id);

    -- ── Auto-update updated_at ───────────────────────────────────────────────────
    create or replace function update_kyc_submission_updated_at()
    returns trigger language plpgsql as $$
    begin
    new.updated_at = now();
    return new;
    end;
    $$;

    drop trigger if exists trg_kyc_submission_updated_at on public.kyc_submissions;
    create trigger trg_kyc_submission_updated_at
    before update on public.kyc_submissions
    for each row execute function update_kyc_submission_updated_at();

    -- ── Row-level security ───────────────────────────────────────────────────────
    alter table public.kyc_submissions enable row level security;
    alter table public.kyc_documents   enable row level security;

    drop policy if exists "users_own_submission" on public.kyc_submissions;
    drop policy if exists "users_own_documents"  on public.kyc_documents;

    create policy "users_own_submission" on public.kyc_submissions
    for all using (auth.uid() = user_id);

    create policy "users_own_documents" on public.kyc_documents
    for all using (auth.uid() = user_id);
    