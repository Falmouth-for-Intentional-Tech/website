# Falmouth for Intentional Tech: website (falmouthfit.org)

A small Hugo site with no theme dependency, hosted free on GitHub Pages. Member sign-ups live on our partner platform (Four Norms or Schools Beyond Screens). This site just links there.

## Edit the basics

Almost everything is in **`hugo.toml`**:

| Setting | What it does |
|---|---|
| `title`, `params.tagline`, `params.location`, `params.email` | Group name, one-line description, contact |
| `params.signupURL` / `signupLabel` | **Where every Join button points.** Set this to your Four Norms group page. To switch platforms later, change this one line. |
| `params.petitionURL` | Optional second button. Leave `""` to hide it. |
| `params.footerBlurb` | One-line description in the footer |
| `params.partners` | Partner orgs listed in the footer, About, and Resources pages |
| `menus.main` | Header and footer navigation. Entries with `params.anchor` jump to a home-page section. |

**Home page text** (hero, stat, quote, About, The Data, Our Goals, closing) is in **`data/home.yaml`**. The home page is one long page with `#about`, `#data`, and `#goals` sections, linked from the nav.

Other pages (Classroom Tech, Events, Resources, Get Involved) live in `content/*.md` as plain Markdown. Colours are at the top of `static/css/style.css`.

Shortcodes you can drop into any page:
- `{{< join >}}`: Join and petition buttons
- `{{< partners >}}`: list of partner orgs
- `{{< email >}}`: contact email link
- `{{< fournorms >}}` / `{{< fournorms-campaigns >}}`: see below

## Sign-ups and Four Norms

The group hub on Four Norms is **Falmouth for Intentional Tech** (URL slug `falmouth-for-intentional-tech`, under the `turning-life-on` organization). Settings are in `hugo.toml`.

* **On-site sign-up form (`/join/`):** it posts to a small Cloudflare Worker in `worker/`, which adds people to the group through the Four Norms API. The API key stays in Cloudflare and is never put in this repo. Setup and testing are in **`worker/README.md`**.
  * Until `signupEndpoint` is set, every Join button links to the Four Norms form instead, so the site works either way.
* **Petitions/pledges and events** appear on the page through Four Norms' embed widgets (`actionsEmbed`, `eventsEmbed`). Adjust `embedHeight` to suit.

### Member count on the home page

The home-page number comes from Four Norms. When GitHub builds the site, `.github/scripts/fetch_fournorms.py` reads the group's membership counts through the API and writes `data/fournorms.json`. The site rebuilds daily, so the number stays fresh.

* **One-time setup:** in the repo, go to **Settings → Secrets and variables → Actions → New repository secret**. Name it `FOUR_NORMS_API_KEY` and paste the key. It's encrypted, and never appears in the code or the built site.
* **What gets counted:** `count_fields` in `data/home.yaml`. Each build log prints the raw numbers under "Fetch member count from Four Norms", so check them once and remove any field that double-counts.
* **Small numbers:** below `minimum` (10), the site shows "New, and growing" instead.
* With no key, or if the API is down, the build still succeeds and shows the fallback.

Shortcodes: `{{< signup-form >}}`, `{{< fournorms >}}` (hub card), `{{< fournorms-embed "actions" >}}`, `{{< fournorms-embed "events" >}}`.

## Preview locally

```bash
hugo server        # then open http://localhost:1313
```

## Publish on GitHub Pages

1. Create a repo (e.g. `website`) and push these files to `main`.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. The workflow in `.github/workflows/hugo.yml` builds and deploys on every push. The site appears at `https://USERNAME.github.io/REPO/`. The workflow sets the base URL automatically.

### Custom domain (optional)

1. Buy a domain (e.g. falmouthfit.org).
2. In **Settings → Pages → Custom domain**, enter it and follow GitHub's DNS instructions.
3. Set `baseURL` in `hugo.toml` to the new domain.

## Adding an event

Edit `content/events.md`. Put the newest event at the top.
