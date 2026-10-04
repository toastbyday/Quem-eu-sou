package br.com.toast.quemeusou;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import android.view.View;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;

public final class MainActivity extends Activity {
 private WebView web;
 private ValueCallback<Uri[]> chooser;
 private static final String HOST = "appassets.androidplatform.net";
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  getWindow().setStatusBarColor(Color.rgb(66,34,117));
  getWindow().setNavigationBarColor(Color.rgb(66,34,117));
  FrameLayout root = new FrameLayout(this);
  web = new WebView(this);
  root.addView(web, new FrameLayout.LayoutParams(-1,-1));
  root.setOnApplyWindowInsetsListener((v,insets) -> {
   v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
   return insets.consumeSystemWindowInsets();
  });
  setContentView(root);
  web.setBackgroundColor(Color.rgb(66,34,117));
  WebSettings settings = web.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(true);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  WebViewAssetLoader loader = new WebViewAssetLoader.Builder().addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
  web.setWebViewClient(new WebViewClient() {
   @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { return loader.shouldInterceptRequest(request.getUrl()); }
   @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
    Uri uri = request.getUrl();
    if ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost())) return false;
    if ("https".equals(uri.getScheme())) { try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {} }
    return true;
   }
  });
  web.setWebChromeClient(new WebChromeClient() {
   @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
    if (chooser != null) chooser.onReceiveValue(null);
    chooser = callback;
    Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    pick.addCategory(Intent.CATEGORY_OPENABLE); pick.setType("image/*");
    try { startActivityForResult(pick, 10); } catch (Exception e) { chooser.onReceiveValue(null); chooser=null; }
    return true;
   }
  });
  web.loadUrl("https://" + HOST + "/index.html");
 }
 @Override protected void onActivityResult(int request, int result, Intent data) {
  super.onActivityResult(request,result,data);
  if (request==10 && chooser!=null) {
   chooser.onReceiveValue(result==RESULT_OK && data!=null && data.getData()!=null ? new Uri[]{data.getData()} : null);
   chooser=null;
  }
 }
 @Override public void onBackPressed() {
  web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');return d?d.id:''})()", value -> {
   if (!"\"\"".equals(value) && !"null".equals(value)) {
    web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d&&d.id!=='nick-dialog')d.dispatchEvent(new Event('cancel',{cancelable:true}));if(d&&d.id!=='nick-dialog'&&d.open)d.close()})()",null);
   } else new AlertDialog.Builder(this).setTitle("Fechar o jogo?").setMessage("Você pode voltar à sua sala enquanto ela estiver ativa.").setNegativeButton("Continuar",null).setPositiveButton("Fechar",(d,w)->finish()).show();
  });
 }
 @Override protected void onDestroy() { if(chooser!=null)chooser.onReceiveValue(null); web.destroy(); super.onDestroy(); }
}
