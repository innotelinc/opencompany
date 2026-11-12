#!/bin/bash
cd /opt/opencompany || exit 1

put() {
  if grep -q "^$1=" .env; then
    sed -i "s#^$1=.*#$1=$2#" .env
  else
    printf "%s=%s\n" "$1" "$2" >> .env
  fi
}

put OPENCOMPANY_BROWSER_ENABLED 1
put OPENCOMPANY_PUBLIC_SITE_URL http://127.0.0.1:3000/site
echo "env_browser=$(grep -c '^OPENCOMPANY_BROWSER_ENABLED=1' .env) env_site=$(grep -c '^OPENCOMPANY_PUBLIC_SITE_URL=' .env)"

echo "== deploy =="
bash scripts/deploy.sh 2>&1 | tail -3

echo "== chromium =="
npx playwright install --with-deps chromium > /root/playwright-install.log 2>&1
echo "playwright_exit=$?"
tail -3 /root/playwright-install.log

echo "== restart =="
systemctl restart opencompany-web opencompany-worker
sleep 10
echo "WEB=$(systemctl is-active opencompany-web) WORKER=$(systemctl is-active opencompany-worker)"

echo "== seed =="
npm run db:seed 2>&1 | tail -4

echo "== site health =="
curl -s -m 25 http://127.0.0.1:3000/api/public-site/health | head -c 400
echo
echo "== committed =="
git log --oneline -1
