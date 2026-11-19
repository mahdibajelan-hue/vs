Official Supabase self-hosting files (the `docker/` folder of github.com/supabase/supabase at tag
`self-hosted/v0.8.4`, Apache-2.0, see LICENSE), copied here unchanged because the partial clone that Supabase's
setup.sh uses fails from servers in Iran. `deploy/server/install.sh` copies this folder to /opt/supabase.
To update: replace this folder with a newer self-hosted tag's `docker/` folder (leave out dev/ and tests/).

One change from the official files: `volumes/functions/main/index.ts` reads `FUNCTIONS_NO_VERIFY_JWT` (comma list of
function names that skip the router's sign-in check, like «verify_jwt: false» on the cloud; used for im-notify, which
checks its caller itself). Keep it when updating to a newer tag. install.sh copies this file to the server on every run.
