#!/usr/bin/env bash
# Jednorazowe uwierzytelnienie XAdES samopodpisanym certyfikatem dla podanego NIP.
# Wypisuje wyłącznie accessToken. Dozwolone tylko na środowisku testowym KSeF.
#
# Aplikacja MF po wypisaniu tokenów woła Console.ReadKey() i przy przekierowanym
# wejściu wywala się z kodem 134 — dlatego kod wyjścia narzędzia jest ignorowany,
# a o powodzeniu decyduje obecność tokenu w wyjściu.
set -u
export DOTNET_ROOT="$HOME/dotnet"; export PATH="$PATH:$HOME/dotnet"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
SP="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$SP/certs/$1" && cd "$SP/certs/$1"

OUTPUT=$(dotnet run --project "$SP/ksef-client-csharp/KSeF.Client.Tests.CertTestApp" \
  --framework net10.0 --no-build -- --output file --nip "$1" --no-startup-warnings < /dev/null 2>/dev/null || true)

TOKEN=$(printf '%s' "$OUTPUT" | grep -oP 'AccessToken:\s*\K[A-Za-z0-9._-]+' | head -1)
[ -n "$TOKEN" ] || { echo "brak accessTokenu dla NIP $1" >&2; exit 1; }
printf '%s\n' "$TOKEN"
