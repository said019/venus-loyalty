package mx.venus.mojileds;
import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.http.SslError;
import android.os.Bundle;
import android.webkit.*;
import android.widget.*;
import java.io.ByteArrayInputStream;
import java.util.concurrent.*;

public final class MainActivity extends Activity {
 private WebView web; private boolean foreground, trusted; private long epoch;
 private PermissionRequest pending; private long permissionEpoch;
 private WhitePulse pulse; private SequenceLeds leds;
 private NativeWhiteCapture still;private volatile byte[] stillJpeg;private volatile int stillId;
 private NativeSequenceCapture sequence;private final java.util.concurrent.ConcurrentHashMap<String,byte[]> sequenceJpegs=new java.util.concurrent.ConcurrentHashMap<>();
 private volatile long sequenceId; private volatile int sequenceShots;
 private ValueCallback<android.net.Uri[]> files;
 private final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor();
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  String original="";try{original=getPackageManager().getPackageInfo("com.yiyuan.skin",0).versionName;}catch(Exception ignored){}
  pulse=new WhitePulse(new GpioWhitePort(android.os.Build.MODEL,original),(ms,r)->timer.schedule(r,ms,TimeUnit.MILLISECONDS));
  leds=new SequenceLeds(new GpioSequencePort(android.os.Build.MODEL,original),(ms,r)->timer.schedule(r,ms,TimeUnit.MILLISECONDS));
  sequence=new NativeSequenceCapture(leds,new NativeSequenceCapture.Result(){
   public void shot(long request,int index,String mode,byte[] jpeg){
    sequenceJpegs.put(request+"/"+index,jpeg);sequenceShots=index+1;
    runOnUiThread(()->{if(sequenceId==request&&foreground&&trusted&&web!=null)web.evaluateJavascript("window.venusNativeSequenceProgress&&window.venusNativeSequenceProgress({request:"+request+",state:2,index:"+index+",total:8,mode:"+org.json.JSONObject.quote(mode)+"})",null);});
   }
   public void finished(long request,byte[][] jpeg,String[] modes,String error){
    runOnUiThread(()->{
     if(sequenceId!=request||!foreground||!trusted||web==null)return;
     String message=error==null?"":error;
     web.evaluateJavascript("window.venusNativeSequenceResult&&window.venusNativeSequenceResult({request:"+request+",ok:"+(jpeg!=null)+",error:"+org.json.JSONObject.quote(message)+"})",null);
    });
   }
  });
  still=new NativeWhiteCapture(pulse,(id,jpeg,error)->runOnUiThread(()->{
   if(id!=stillId||!foreground||!trusted)return;
   stillJpeg=jpeg;
   String message=error==null?"":error;
   web.evaluateJavascript("window.venusNativeStillResult&&window.venusNativeStillResult({request:"+id+",ok:"+(jpeg!=null)+",error:"+org.json.JSONObject.quote(message)+"})",null);
  }));
  LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);
  Button off=new Button(this);off.setText("Apagar luz");off.setAllCaps(false);off.setTextSize(14);off.setTextColor(android.graphics.Color.rgb(162,54,54));off.setBackgroundColor(android.graphics.Color.rgb(255,249,247));off.setOnClickListener(v->cancel());layout.addView(off);
  web=new WebView(this);layout.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(layout);
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
  s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);
  s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportMultipleWindows(false);s.setJavaScriptCanOpenWindowsAutomatically(false);
  s.setMediaPlaybackRequiresUserGesture(false);s.setUserAgentString(s.getUserAgentString()+" VenusMoji/0.9.0 VenusNativeStill/1 VenusNativeSequence/1");
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
    String url=request.getUrl().toString(); boolean main=request.isForMainFrame();
    long sequenceReq=Policy.sequenceRequest(url);
    if(sequenceReq>0){
     if(main&&request.hasGesture()&&foreground&&trusted&&Policy.document(current())&&checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED){
      still.cancel();sequence.cancel();sequenceJpegs.clear();sequenceId=sequenceReq;sequenceShots=0;
      sequence.start(sequenceReq,Policy.sequenceRotation(url));
     }else if(main&&foreground&&trusted){web.evaluateJavascript("window.venusNativeSequenceResult&&window.venusNativeSequenceResult({request:"+sequenceReq+",ok:false,error:'Captura no autorizada. Pulsa de nuevo el boton.'})",null);}
     return true;
    }
    int captureId=Policy.stillRequest(url);
    if(captureId>0){
     if(main&&request.hasGesture()&&foreground&&trusted&&Policy.document(current())&&checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED){
      still.cancel();stillJpeg=null;stillId=captureId;
      still.start(captureId,Integer.parseInt(url.substring(url.lastIndexOf('=')+1)));
     }else if(main&&foreground&&trusted){web.evaluateJavascript("window.venusNativeStillResult&&window.venusNativeStillResult({request:"+captureId+",ok:false,error:'Captura no autorizada. Pulsa de nuevo el boton.'})",null);}
     return true;
    }
    int id=Policy.white(url,current(),main,request.hasGesture(),foreground&&trusted);
    if(id>0){long token=epoch;boolean ok=pulse.start();android.util.Log.i("VenusMoji","White request="+id+" accepted="+ok);if(token==epoch && foreground && trusted)reply(id,ok);return true;}
    int denied=Policy.whiteRequest(url);
    if(denied>0){
     android.util.Log.w("VenusMoji","White rejected: main="+main+" gesture="+request.hasGesture()+" foreground="+foreground+" trusted="+trusted);
     if(main&&foreground&&trusted&&Policy.document(current()))reply(denied,false);
     return true;
    }
    if(Policy.off(url,current(),main)){cancel();return true;}
    if(main){cancel();trusted=false;return !Policy.navigation(url);}
    return !Policy.resource(url);
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,String url){cancel();trusted=false;return true;}
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
    java.util.regex.Matcher seq = java.util.regex.Pattern.compile("https://venuscosmetologia\\.com\\.mx/__native-sequence/(\\d+)/(\\d)\\.jpg").matcher(request.getUrl().toString());
    if(seq.matches()){
     byte[] jpeg=sequenceJpegs.get(seq.group(1)+"/"+seq.group(2));
     if(!"GET".equals(request.getMethod())||request.isForMainFrame()||jpeg==null)return blocked();
     java.util.Map<String,String> headers=new java.util.HashMap<>();headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");
     return new WebResourceResponse("image/jpeg",null,200,"OK",headers,new ByteArrayInputStream(jpeg));
    }
    if(request.getUrl().toString().equals("https://venuscosmetologia.com.mx/__native-capture/"+stillId+".jpg")){
     byte[] jpeg=stillJpeg;
     if(!"GET".equals(request.getMethod())||request.isForMainFrame()||jpeg==null)return blocked();
     java.util.Map<String,String> headers=new java.util.HashMap<>();headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");
     return new WebResourceResponse("image/jpeg",null,200,"OK",headers,new ByteArrayInputStream(jpeg));
    }
    if(!Policy.resource(request.getUrl().toString()))return blocked();
    if(request.isForMainFrame()&&!Policy.navigation(request.getUrl().toString()))return blocked();
    return null;
   }
   @Override public void onPageStarted(WebView view,String url,Bitmap icon){if(files!=null){files.onReceiveValue(null);files=null;}cancel();trusted=false;if(!Policy.navigation(url))view.stopLoading();}
   @Override public void onPageFinished(WebView view,String url){trusted=Policy.PAGE.equals(url)&&Policy.PAGE.equals(view.getUrl());}
   @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){handler.cancel();fail();}
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())fail();else cancel();}
   @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){if(request.isForMainFrame())fail();else cancel();}
   @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){fail();return false;}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<android.net.Uri[]> callback,FileChooserParams params){
    if(files!=null){files.onReceiveValue(null);files=null;}
    if(!foreground||!trusted||!Policy.document(current())){callback.onReceiveValue(null);return true;}
    cancel();files=callback;
    Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.addCategory(Intent.CATEGORY_OPENABLE);pick.setType("image/jpeg");pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);
    try{startActivityForResult(pick,29);}catch(Exception e){files.onReceiveValue(null);files=null;}
    return true;
   }
   @Override public void onPermissionRequest(PermissionRequest request){
    invalidatePermission();
    if(!cameraAllowed(request)){request.deny();return;}
    if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED){request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});return;}
    pending=request;permissionEpoch=epoch;requestPermissions(new String[]{Manifest.permission.CAMERA},8);
   }
   @Override public void onPermissionRequestCanceled(PermissionRequest request){if(pending==request)pending=null;}
  });
  web.loadUrl(Policy.PAGE);
 }
 private static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 @Override protected void onActivityResult(int request,int result,Intent data){
  super.onActivityResult(request,result,data);
  if(request!=29||files==null)return;
  ValueCallback<android.net.Uri[]> callback=files;files=null;
  if(result!=RESULT_OK||data==null||!trusted||!Policy.document(current())){callback.onReceiveValue(null);return;}
  java.util.ArrayList<android.net.Uri> selected=new java.util.ArrayList<>();
  if(data.getClipData()!=null){for(int i=0;i<data.getClipData().getItemCount();i++)selected.add(data.getClipData().getItemAt(i).getUri());}
  else if(data.getData()!=null)selected.add(data.getData());
  if(selected.size()!=6){callback.onReceiveValue(null);Toast.makeText(this,"Selecciona las seis fotos de una captura",Toast.LENGTH_LONG).show();return;}
  for(android.net.Uri uri:selected)if(!"content".equals(uri.getScheme())){callback.onReceiveValue(null);return;}
  callback.onReceiveValue(selected.toArray(new android.net.Uri[0]));
 }
 private String current(){return web==null?null:web.getUrl();}
 private boolean cameraAllowed(PermissionRequest request){
  String[] resources=request.getResources();
  return foreground&&trusted&&Policy.document(current())&&Policy.origin(request.getOrigin().toString())&&resources.length==1&&PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0]);
 }
 private void invalidatePermission(){if(pending!=null){pending.deny();pending=null;}}
 private void cancel(){
  int cancelled=stillId; long seqCancelled=sequenceId;
  epoch++;invalidatePermission();stillId=0;stillJpeg=null;sequenceId=0;sequenceShots=0;
  if(still!=null)still.cancel();
  if(sequence!=null){sequence.cancel();}else if(pulse!=null)pulse.forceOff();
  if(leds!=null)leds.forceOffAll();sequenceJpegs.clear();
  if(seqCancelled>0&&web!=null&&foreground&&trusted&&Policy.document(current())){
   web.evaluateJavascript("window.venusNativeSequenceResult&&window.venusNativeSequenceResult({request:"+seqCancelled+",ok:false,error:'Secuencia cancelada. Se envio la orden de apagado.'})",null);
  }
  if(cancelled>0&&web!=null&&foreground&&trusted&&Policy.document(current())){
   web.evaluateJavascript("window.venusNativeStillResult&&window.venusNativeStillResult({request:"+cancelled+",ok:false,error:'Captura cancelada. Se envio la orden de apagado.'})",null);
  }
 }
 private void fail(){trusted=false;cancel();}
 private void reply(int id,boolean ok){web.evaluateJavascript("if(typeof window.venusMojiLightResult==='function')window.venusMojiLightResult({ok:"+ok+",command:'white',request:"+id+"})",null);}
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){
  super.onRequestPermissionsResult(code,permissions,grants);PermissionRequest request=pending;pending=null;
  if(request!=null){if(code==8&&permissionEpoch==epoch&&grants.length==1&&grants[0]==PackageManager.PERMISSION_GRANTED&&cameraAllowed(request))request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else request.deny();}
 }
 @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);cancel();trusted=false;web.loadUrl(Policy.PAGE);}
 @Override protected void onResume(){super.onResume();foreground=true;if(web!=null)web.onResume();}
 @Override protected void onPause(){foreground=false;cancel();if(web!=null)web.onPause();super.onPause();}
 @Override protected void onDestroy(){foreground=false;fail();if(still!=null)still.destroy();if(sequence!=null)sequence.destroy();timer.shutdown();if(web!=null){web.stopLoading();web.destroy();web=null;}super.onDestroy();}
 @Override public void onBackPressed(){cancel();if(Policy.navigation(current())&&!Policy.document(current())){trusted=false;web.loadUrl(Policy.PAGE);}else finish();}
}
