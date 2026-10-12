-- Agenda Estética — banco de dados no Supabase
-- Cole tudo no SQL Editor do Supabase e toque em Run. Pode rodar de novo sem problema.

-- 1) Perfis da equipe (um por login)
create table if not exists public.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  perfil text not null default 'profissional' check (perfil in ('admin','profissional')),
  aprovado boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table public.perfis add column if not exists aprovado boolean not null default false;

-- 2) Todos os registros do app (agenda, clientes, pacotes, etc.)
create table if not exists public.registros (
  colecao text not null,
  id text not null,
  dados jsonb not null default '{}'::jsonb,
  token text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (colecao, id)
);
create index if not exists registros_token_idx on public.registros (token) where token is not null;

-- 3) Quem é administração?
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where user_id = auth.uid() and perfil = 'admin' and aprovado);
$$;
-- Quem tem acesso liberado?
create or replace function public.eh_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where user_id = auth.uid() and aprovado);
$$;

-- 4) Ao criar um login, cria o perfil aguardando liberação. O primeiro login vira administração já liberada.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare primeiro boolean;
begin
  primeiro := not exists (select 1 from public.perfis where perfil = 'admin' and aprovado);
  insert into public.perfis (user_id, nome, perfil, aprovado)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'nome',''), split_part(new.email,'@',1)),
          case when primeiro then 'admin' else 'profissional' end, primeiro)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

-- 5) Segurança: só quem está logado vê os dados
alter table public.perfis enable row level security;
alter table public.registros enable row level security;

drop policy if exists "equipe le perfis" on public.perfis;
create policy "equipe le perfis" on public.perfis for select to authenticated using (user_id = auth.uid() or public.eh_equipe());
drop policy if exists "admin altera perfis" on public.perfis;
create policy "admin altera perfis" on public.perfis for update to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists "cada um muda o proprio nome" on public.perfis;

drop policy if exists "equipe le registros" on public.registros;
create policy "equipe le registros" on public.registros for select to authenticated using (public.eh_equipe());
drop policy if exists "equipe grava registros" on public.registros;
create policy "equipe grava registros" on public.registros for insert to authenticated
  with check (public.eh_equipe() and (colecao not in ('config','saidas','servicos','modelosPacote') or public.eh_admin()));
drop policy if exists "equipe altera registros" on public.registros;
create policy "equipe altera registros" on public.registros for update to authenticated
  using (public.eh_equipe() and (colecao not in ('config','saidas','servicos','modelosPacote') or public.eh_admin()))
  with check (public.eh_equipe() and (colecao not in ('config','saidas','servicos','modelosPacote') or public.eh_admin()));
drop policy if exists "equipe apaga registros" on public.registros;
create policy "equipe apaga registros" on public.registros for delete to authenticated
  using (public.eh_equipe() and (colecao not in ('config','saidas','servicos','modelosPacote') or public.eh_admin()));

-- 6) Link público da cliente: mostra só aquele horário, pelo código aleatório
create or replace function public.evento_publico(t text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a jsonb; cfg jsonb; nomes text; prof text;
begin
  if t is null or length(t) < 12 then return jsonb_build_object('ok', false); end if;
  select dados into a from public.registros where colecao = 'atendimentos' and token = t limit 1;
  if a is null then return jsonb_build_object('ok', false); end if;
  select dados into cfg from public.registros where colecao = 'config' and id = 'geral';
  select string_agg(coalesce(s.dados->>'nome','Atendimento'), ' + ' order by i.ord) into nomes
    from jsonb_array_elements(coalesce(a->'itens','[]'::jsonb)) with ordinality as i(item, ord)
    left join public.registros s on s.colecao = 'servicos' and s.id = i.item->>'servicoId';
  select p.dados->>'nome' into prof from public.registros p where p.colecao = 'profissionais' and p.id = a->>'profId';
  return jsonb_build_object(
    'ok', true,
    'titulo', coalesce(nomes, 'Atendimento'),
    'local', coalesce(cfg->>'nomeEspaco', 'Agenda Estética'),
    'endereco', coalesce(cfg->>'endereco', ''),
    'profissional', coalesce(prof, ''),
    'data', a->>'data', 'hora', a->>'hora',
    'duracao', coalesce((a->>'duracao')::int, 30),
    'status', coalesce(a->>'status', 'agendado'));
end $$;
revoke all on function public.evento_publico(text) from public;
grant execute on function public.evento_publico(text) to anon, authenticated;

revoke all on function public.novo_usuario() from public, anon, authenticated;
revoke all on function public.eh_admin() from public, anon;
revoke all on function public.eh_equipe() from public, anon;
grant execute on function public.eh_admin() to authenticated;
grant execute on function public.eh_equipe() to authenticated;

-- 7) Atualização ao vivo entre aparelhos
do $$ begin
  alter publication supabase_realtime add table public.registros;
exception when duplicate_object then null; when undefined_object then null; end $$;

select 'Pronto! Banco da Agenda Estética criado.' as resultado;
