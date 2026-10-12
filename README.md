# Agenda Estética

App de agenda para manicure e estética: várias profissionais, pacotes de sessões, mensagens do dia pelo WhatsApp, dia do laser e financeiro.

- **Site:** `index.html` (abre no navegador do celular; pode ser adicionado à tela inicial)
- **Link da cliente:** `h.html?t=CODIGO`, mostra o horário e salva na agenda do celular (Google Agenda ou iPhone)
- **Banco de dados:** planilha *Agenda Estética - Banco de dados* no Google Drive (pasta App Estética), acessada pelo Apps Script em `apps-script/Codigo.gs`
- **Senhas:** aba *Senhas* da planilha (Nome, Senha, Perfil `admin` ou `profissional`)
- **Endereço do Apps Script:** em `config.js`

## Publicar o Apps Script (uma vez)

1. Abra a planilha no Drive > **Extensões > Apps Script**
2. Apague o conteúdo de `Código.gs` e cole o conteúdo de `apps-script/Codigo.gs`
3. Em **Configurações do projeto**, marque "Mostrar arquivo de manifesto appsscript.json" e cole o conteúdo de `apps-script/appsscript.json`
4. **Implantar > Nova implantação > App da Web**: Executar como **Eu**, Quem pode acessar **Qualquer pessoa**
5. Autorize, copie o endereço que termina em `/exec` e cole em `config.js`
6. Rode a função `instalarBackupDiario` uma vez para ligar o backup diário
