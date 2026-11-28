#!/usr/bin/env python3
"""Copy Supabase Storage files from the cloud project to this server's Supabase (or, with the two sides swapped by
copy-competency-to-cloud.sh, from this server to the cloud).

Called by migrate-data.sh, which writes the bucket and file lists from the cloud database and passes the keys in the
environment (never on the command line). Files already on the server with the same size are skipped, so a run that
stopped half way (the cloud is sometimes unreachable from Iran) can simply be run again.

Environment: CLOUD_URL, CLOUD_KEY (from), LOCAL_URL, LOCAL_KEY (to), BUCKETS_JSON, OBJECTS_JSON, LOCAL_JSON, FAILED_TXT,
FROM_NAME / TO_NAME (only for the messages)
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CLOUD_URL = os.environ["CLOUD_URL"].rstrip("/")
CLOUD_KEY = os.environ["CLOUD_KEY"]
LOCAL_URL = os.environ["LOCAL_URL"].rstrip("/")
LOCAL_KEY = os.environ["LOCAL_KEY"]


def headers(key):
    # a legacy service_role key is a JWT and goes in both headers; a new sb_secret_ key only in apikey
    h = {"apikey": key}
    if not key.startswith("sb_"):
        h["Authorization"] = "Bearer " + key
    return h


def request(method, url, key, body=None, extra=None, timeout=180):
    h = headers(key)
    h.update(extra or {})
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


def retry(fn, tries=5):
    for i in range(tries):
        try:
            return fn()
        except urllib.error.HTTPError as e:
            # 4xx other than 429 will not get better by waiting
            if 400 <= e.code < 500 and e.code != 429:
                raise
            last = e
        except Exception as e:  # network trouble: wait and try again
            last = e
        time.sleep(3 * (i + 1))
    raise last


def obj_path(bucket, name):
    return urllib.parse.quote(bucket, safe="") + "/" + urllib.parse.quote(name, safe="/")


def ensure_buckets(buckets):
    for b in buckets:
        body = {"id": b["id"], "name": b["id"], "public": bool(b["public"]),
                "file_size_limit": b.get("file_size_limit"), "allowed_mime_types": b.get("allowed_mime_types")}
        data = json.dumps(body).encode()
        try:
            request("POST", f"{LOCAL_URL}/storage/v1/bucket", LOCAL_KEY, data, {"Content-Type": "application/json"})
            print(f"    bucket created: {b['id']}")
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")
            if "exist" not in msg.lower() and e.code not in (400, 409):
                raise SystemExit(f"Could not create bucket {b['id']}: {e.code} {msg}")
            request("PUT", f"{LOCAL_URL}/storage/v1/bucket/{urllib.parse.quote(b['id'], safe='')}", LOCAL_KEY, data,
                    {"Content-Type": "application/json"})
            print(f"    bucket kept:    {b['id']}")


def main():
    buckets = json.load(open(os.environ["BUCKETS_JSON"])) or []
    objects = json.load(open(os.environ["OBJECTS_JSON"])) or []
    local = {f"{o['bucket']}/{o['name']}": o.get("size") for o in (json.load(open(os.environ["LOCAL_JSON"])) or [])}

    ensure_buckets(buckets)

    todo = [o for o in objects if local.get(f"{o['bucket']}/{o['name']}") is None
            or (o.get("size") is not None and local.get(f"{o['bucket']}/{o['name']}") != o["size"])]
    src, dst = os.environ.get("FROM_NAME", "the cloud"), os.environ.get("TO_NAME", "here")
    print(f"    {len(objects)} files on {src}, {len(objects) - len(todo)} already on {dst}, {len(todo)} to copy")

    failed, done, size = [], 0, 0
    for i, o in enumerate(todo, 1):
        p = obj_path(o["bucket"], o["name"])
        try:
            _, data = retry(lambda: request("GET", f"{CLOUD_URL}/storage/v1/object/{p}", CLOUD_KEY))
            extra = {"Content-Type": o.get("mime") or "application/octet-stream", "x-upsert": "true"}
            if o.get("cache"):
                extra["cache-control"] = o["cache"]
            retry(lambda: request("POST", f"{LOCAL_URL}/storage/v1/object/{p}", LOCAL_KEY, data, extra))
            done += 1
            size += len(data)
        except Exception as e:  # keep going; the list of failures is printed at the end
            detail = e.read().decode(errors="replace")[:200] if isinstance(e, urllib.error.HTTPError) else str(e)
            failed.append(f"{o['bucket']}/{o['name']}  ->  {detail}")
        if i % 20 == 0 or i == len(todo):
            print(f"    {i}/{len(todo)} files  ({size / 1048576:.1f} MB copied, {len(failed)} failed)", flush=True)

    with open(os.environ["FAILED_TXT"], "w") as f:
        f.write("\n".join(failed) + ("\n" if failed else ""))
    if failed:
        print(f"    {len(failed)} files could not be copied (list: {os.environ['FAILED_TXT']}):")
        for line in failed[:10]:
            print("      " + line)
        sys.exit(2)


if __name__ == "__main__":
    main()
