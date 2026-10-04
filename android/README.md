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
