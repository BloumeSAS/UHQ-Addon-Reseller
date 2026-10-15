# 🛒 UHQ.Monster Reseller Addon

> **Free Addon by [Bloume SAS](https://bloume.fr)**
> Achetez et gérez vos proxies [UHQ.Monster](https://uhq.monster) **directement depuis [UHQ Panel OS](https://github.com/BloumeSAS/UHQ-Panel-OS)** : solde, création, ajout/retrait de Go, et import automatique dans vos catégories — sans copier-coller d'identifiants.

---

## Fonctionnalités

| Section | Ce que vous y trouvez |
|---|---|
| **Aperçu** | Solde du portefeuille, remise revendeur, nombre de proxies, bande passante achetée / utilisée, alertes (solde faible, proxies non importés) |
| **Acheter un proxy** | Produit, quantité (limites du produit vérifiées), pays, type de session, durée, **catégorie du panel** où l'importer. Coût estimé affiché, **confirmation obligatoire** avant tout débit |
| **Mes proxies** | Liste avec usage, détail en direct (identifiants, threads, restant), **+ Go**, **− Go (remboursement)**, import / changement de catégorie, suppression |
| **Historique** | Journal des opérations faites depuis le panel (achat, Go, import, suppression) — jamais de secret |
| **Paramètres** | Saisie de la **clé API revendeur** (vérifiée avant enregistrement, jamais ré-affichée) |
| **Widget « Pool »** | Achat rapide sur la page **Pool de proxies** du panel, importé dans la catégorie choisie |

### Comment ça marche
1. Dans **Paramètres**, collez votre clé API revendeur UHQ.Monster (dashboard UHQ.Monster → *Revendeur → API*).
2. **Acheter un proxy** : l'addon appelle l'API UHQ.Monster, puis **importe le proxy** (`http://user:pass@hôte:port`) dans la catégorie du panel choisie (fournisseur « Manual »).
3. Pour une passerelle résidentielle, choisissez une catégorie **« Toujours en ligne »** afin que le checker ne la marque pas morte.

---

## Prérequis

| Outil | Version minimale |
|---|---|
| Node.js | 20+ |
| UHQ Panel OS | **2.4.91+** |
| Compte revendeur | approuvé sur uhq.monster, avec clé API |

---

## Installation

Embarqué dans l'image du panel : **Extensions → UHQ.Monster Reseller → Activer**.

En déploiement séparé :

```bash
git clone https://github.com/BloumeSAS/UHQ-Addon-Reseller
cd UHQ-Addon-Reseller
npm run install:all
cp .env.example .env     # ajuster PANEL_URL et PANEL_API_KEY
npm run build && npm start
```

Connecter dans le panel : `http://localhost:3001`

---

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3001` | Port d'écoute |
| `PANEL_URL` | `http://localhost:8000` | URL du panel |
| `PANEL_API_KEY` | — | Clé API du panel (protège l'export/import de sauvegarde) |
| `DB_PATH` | `./data/reseller-data.json` | Fichier de données (clé API revendeur, correspondances, historique) |

---

## Sécurité

Cet addon **dépense de l'argent** (votre solde UHQ.Monster) : il est durci en conséquence.

- **Administrateurs uniquement.** Chaque appel est vérifié **par le panel** (signature et expiration du JWT contrôlées via `/api/panel/security/me`) et le rôle doit être `ADMIN` ; un jeton falsifié, un compte SUPPORT ou USER est refusé.
- **La clé API UHQ.Monster reste côté serveur** : enregistrée dans le fichier de données (mode `0600`, écriture atomique), **jamais renvoyée au navigateur** (seuls 4 caractères de début et de fin le sont), **jamais incluse dans la sauvegarde du panel**, jamais journalisée.
- **Aucun achat sans confirmation** du coût côté interface ; côté serveur : quantités contrôlées avec les limites du produit, solde vérifié avant achat, **une seule opération d'argent à la fois** (double clic, deux onglets).
- **Pas d'idempotence chez UHQ.Monster** : chaque achat porte un **libellé unique** ; si UHQ.Monster répond par une erreur ambiguë (coupure, 5xx), l'addon **retrouve le proxy par son libellé** avant de conclure — jamais de réessai à l'aveugle, donc jamais de double débit.
- La suppression d'un proxy est définitive et **sans remboursement** : elle demande de retaper son libellé. Reprenez d'abord la bande passante pour récupérer votre crédit.
- Les mots de passe des proxies ne sont **pas stockés** par l'addon (ils sont relus chez UHQ.Monster) ; l'historique ne contient aucun secret.
- Aucun CORS, jeton lu uniquement dans l'en-tête `Authorization`, conteneur non-root.

---

## Limites

- Réinitialisation du mot de passe, liste d'IP autorisées et changement de pays d'un proxy existant (`PATCH /proxies/{id}` de l'API) ne sont pas exposés pour le moment.
- Le retrait du panel à la suppression nécessite que le proxy ait été importé dans une **catégorie** (sans catégorie, retirez-le manuellement dans « Pool »).
- Les proxies achetés hors de l'addon apparaissent dans « Mes proxies » (liste de l'API) et peuvent être importés.

---

Licence MIT — © Bloume SAS

