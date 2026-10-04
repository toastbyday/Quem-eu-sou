# Quem eu sou? para Android

App Android 6 ou superior. A interface vem dentro do aplicativo; o multiplayer usa o mesmo Supabase do site e requer internet. Os temas, o nick e a foto são salvos no armazenamento privado do app. A galeria é aberta pelo seletor do Android, sem permissão de acesso geral às fotos.

## Compilar

Java 17, Gradle 8.9 e Android SDK 35:

```
node android/prepare-assets.mjs
gradle -p android assembleDebug
```

APK instalável assinado para testes: `android/app/build/outputs/apk/debug/app-debug.apk`.

O workflow **Android APK** gera o arquivo no GitHub Actions. Essa versão tem assinatura de desenvolvimento e não é uma publicação na Play Store. Para distribuir futuras atualizações com assinatura de produção, configure uma chave de lançamento privada e estável antes de publicar. Não envie chaves de assinatura ao repositório.

## Verificação de atualizações

Ao abrir ou retornar ao app, ele consulta `https://quem-eu-sou-smoky.vercel.app/app-version.json` em segundo plano (intervalo mínimo de 30 segundos). Se `versionCode` for maior que a versão instalada, abre a página de download no navegador. Falha de rede não interrompe o jogo. É necessário instalar a versão 1.3.0 uma vez para receber esse comportamento.

Ao publicar uma versão: aumente `versionCode`/`versionName` no Gradle, compile com a mesma chave, atualize `downloads/Quem-eu-sou.apk`, `app-version.json` e a versão em `download.html` no mesmo commit. O build do site inclui o APK e o manifesto. Não anuncie uma versão sem o APK correspondente.

## Produção preparada — em revisão

A versão 1.3.1 (versionCode 7) possui configuração release sem depuração e assinatura própria. Compile com QES_SIGNING_STORE e QES_SIGNING_PASSWORD definidos no ambiente, executando assembleRelease. A chave fica privada, fora do repositório. O APK público continua na versão 1.3.0 até esclarecer o alerta do Play Protect.

A chave de produção é diferente da chave de teste: o Android não aceita atualização direta entre elas. Planeje a migração antes de distribuir para evitar perda do perfil local. Assinatura válida e permissão mínima não equivalem a uma aprovação pelo Google.
