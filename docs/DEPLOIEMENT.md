# Déploiement

## Démo statique

GitHub Pages peut servir l'application web en mode DEMO. Ses règles excluent l'exploitation d'un SaaS et l'envoi de mots de passe ou de numéros de carte : aucune fonction de compte ne doit y être exposée.

## Plateforme

1. Copier `.env.example` en `.env` et définir un `POSTGRES_PASSWORD` fort.
2. Lancer `docker compose up --build -d`. L'API applique ses migrations au démarrage.
3. Placer l'API derrière un proxy HTTPS. Sans HTTPS, les mots de passe circuleraient en clair.
4. Renseigner dans `CORS_ORIGINS` l'adresse exacte de l'application web.
5. Sauvegarder le volume PostgreSQL et tester la restauration.

Si PostgreSQL est fourni par un service géré, le compte de connexion doit pouvoir créer l'extension PostGIS et le rôle `terriscope_app`, ou ces deux éléments doivent être créés au préalable.

## Routage

`docker compose --profile routing up -d` télécharge l'extrait OpenStreetMap du Maroc et construit le graphe routier, ce qui peut prendre du temps et de la mémoire. Définir ensuite `VALHALLA_URL=http://valhalla:8002`. Cette configuration n'a pas encore été exécutée ; à valider sur le serveur cible. Les données OpenStreetMap exigent l'attribution « © OpenStreetMap contributors ».

## À valider avant une mise en production

- Choix de l'hébergeur et de son pays, au regard de la loi 09-08 et avec l'avis d'un juriste.
- Déclaration à la CNDP.
- Prestataire de paiement : aucun paiement réel n'est implémenté.
- Vérification de l'adresse e-mail et réinitialisation du mot de passe, encore absentes.
