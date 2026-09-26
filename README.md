# The Limo Marketing Agency - Client Audits

This repository is intended only for client audit reports.

Current report structure:

reports/
  lt-chauffeurs/
    seo-audit/
      index.html

Future reports should follow the same format:

reports/
  client-name/
    seo-audit/
      index.html

or:

reports/
  client-name/
    google-ads-audit/
      index.html

## Deploy from VS Code / PowerShell

Create a folder on Desktop:

```powershell
cd "$HOME\Desktop"
mkdir the-limo-marketing-agency-audits
cd "$HOME\Desktop\the-limo-marketing-agency-audits"
```

Extract this ZIP into that folder, then open VS Code:

```powershell
code -n .
```

Initialize Git:

```powershell
git init
git branch -M main
git add .
git commit -m "Add LT Chauffeurs SEO audit"
```

Create the GitHub repository and push:

```powershell
gh repo create the-limo-marketing-agency-audits --public --source=. --remote=origin --push
```

Enable GitHub Pages from main branch root:

```powershell
gh api --method POST repos/osamaghaffar-the-specialist/the-limo-marketing-agency-audits/pages -f "source[branch]=main" -f "source[path]=/"
```

Check Pages build:

```powershell
gh api repos/osamaghaffar-the-specialist/the-limo-marketing-agency-audits/pages/builds/latest --jq "{status: .status, error: .error.message}"
```

Client report URL after build:

https://osamaghaffar-the-specialist.github.io/the-limo-marketing-agency-audits/reports/lt-chauffeurs/seo-audit/

Important:
- robots.txt and noindex reduce search-engine indexing.
- A public GitHub repository / GitHub Pages site is not password-protected.
- Do not store passwords, API keys, private credentials, or highly sensitive client data here.
