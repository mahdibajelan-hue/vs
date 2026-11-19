Official Supabase self-hosting files (the `docker/` folder of github.com/supabase/supabase at tag
`self-hosted/v0.8.4`, Apache-2.0, see LICENSE), copied here unchanged because the partial clone that Supabase's
setup.sh uses fails from servers in Iran. `deploy/server/install.sh` copies this folder to /opt/supabase.
To update: replace this folder with a newer self-hosted tag's `docker/` folder (leave out dev/ and tests/).
