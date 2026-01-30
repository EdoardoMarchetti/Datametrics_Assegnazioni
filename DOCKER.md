# Docker – tutto in container, nulla in locale

L’app va usata **solo via Docker**; non serve `npm install` in locale.

## Avvio

```bash
docker compose up --build
```

## Dopo aver modificato `package.json`

Se aggiungi o cambi dipendenze, **ricostruisci l’immagine** così da far girare `npm install` nel container:

```bash
docker compose build --no-cache
docker compose up
```

Oppure in un solo comando:

```bash
docker compose up --build --force-recreate
```

Solo così le nuove dipendenze (es. `html-to-image`) vengono installate nel container.
