# Agenda Estética

App de agenda para manicure e estética: várias profissionais, pacotes de sessões, mensagens do dia pelo WhatsApp, dia do laser e financeiro.

- **Site:** `index.html` (abre no navegador do celular; pode ser adicionado à tela inicial)
- **Link da cliente:** `h.html?t=CODIGO`, mostra o horário e salva na agenda do celular (Google Agenda ou iPhone)
- **Banco de dados:** Supabase. Estrutura em `supabase/banco.sql` (rodar uma vez no SQL Editor; pode rodar de novo sem problema)
- **Ligação com o banco:** `config.js` (endereço do projeto e chave pública)
- **Acessos:** cada pessoa entra com e-mail e senha criados em Authentication > Users no Supabase. O primeiro login vira administração
- **Copiar o código do banco pelo celular:** `configurar.html`
