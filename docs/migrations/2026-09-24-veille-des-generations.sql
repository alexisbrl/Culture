-- La veille des générations, chaque minute — À APPLIQUER UNE FOIS LE CODE EN LIGNE.
--
-- Appelle la route `/api/ingest/watchdog` du site en ligne : elle reprend une fois
-- une étape coupée par la limite de durée de l'hébergeur, et relance ce qu'aucun
-- relais n'a pris (docs/architecture.md §7.11). Sans elle, une génération que plus
-- personne ne regarde peut rester bloquée ; tant que l'écran est ouvert, il fait
-- lui-même cette veille à chaque lecture d'avancement.
--
-- ⚠️ Pas avant le déploiement : la route n'existe pas encore en ligne. L'appeler
-- plus tôt ne casserait rien (une erreur 404 par minute), mais ne servirait à rien.
--
-- L'adresse est celle du domaine de production (get-culture.com, vérifié le
-- 24/09/2026 : www.get-culture.com y redirige, et une redirection ferait perdre
-- l'appel). La veille ne touche que les générations ouvertes depuis cette adresse ;
-- celles lancées en local sont menées par le serveur local.

create extension if not exists pg_net;

select cron.schedule(
  'veille-des-generations',
  '* * * * *',
  $$ select net.http_post(url := 'https://get-culture.com/api/ingest/watchdog', body := '{}'::jsonb) $$
);

-- Pour l'arrêter : select cron.unschedule('veille-des-generations');
