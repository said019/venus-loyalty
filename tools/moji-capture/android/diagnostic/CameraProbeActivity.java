package mx.venus.mojileds;

import android.app.Activity;
import android.graphics.BitmapFactory;
import android.os.*;
import android.widget.TextView;
import android.util.Log;

/** Test-only package: simulated illumination, private temporary images, no client data. */
public final class CameraProbeActivity extends Activity {
 private HandlerThread worker;private Handler handler;private NativeStillCamera camera;
 private TextView text;private volatile boolean done,paused;private int count;
 private CaptureSequence sequence;private CaptureStore store;
 private NativeWhiteCapture bridge;
 private final java.util.concurrent.ScheduledExecutorService deadlines=java.util.concurrent.Executors.newSingleThreadScheduledExecutor();
 @Override public void onCreate(Bundle state){
  super.onCreate(state);text=new TextView(this);text.setTextSize(22);text.setPadding(32,32,32,32);
  text.setText("Prueba de ocho capturas. Luces desactivadas. Guardado temporal local.");setContentView(text);
  worker=new HandlerThread("VenusCameraProbe");worker.start();handler=new Handler(worker.getLooper());
  new Handler().postDelayed(()->{if(!done){Log.e("VenusCameraProbe","FAIL global timeout");android.os.Process.killProcess(android.os.Process.myPid());}},60000);
  if(getIntent().getBooleanExtra("nativeBridge",false)){
   WhitePulse simulated=new WhitePulse(value->Log.i("VenusCameraProbe","SIMULATED light write="+value),(ms,r)->deadlines.schedule(r,ms,java.util.concurrent.TimeUnit.MILLISECONDS));
   bridge=new NativeWhiteCapture(simulated,(request,jpeg,error)->handler.post(()->{
    if(jpeg==null){finishTest("FAIL native bridge "+error);return;}
    BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;BitmapFactory.decodeByteArray(jpeg,0,jpeg.length,bounds);
    finishTest(bounds.outWidth>0?"PASS native bridge JPEG="+bounds.outWidth+"x"+bounds.outHeight+" bytes="+jpeg.length+"; light adapter simulated":"FAIL native bridge JPEG");
   }));
   bridge.start(1,90);return;
  }
  handler.post(()->{
   camera=new NativeStillCamera(handler);
   try{camera.open(90);startSequence();}catch(Exception e){finishTest("FAIL open "+e.toString());}
  });
 }
 private void startSequence(){
  store=new CaptureStore(getFilesDir().toPath().resolve("diagnostic-only"));
  sequence=new CaptureSequence(new CaptureSequence.Port(){
   public void after(int ms,Runnable action){deadlines.schedule(action,ms,java.util.concurrent.TimeUnit.MILLISECONDS);}
   public void off(){}
   public void light(CaptureSequence.Shot shot){handler.post(()->sequence.lit(shot.request));}
   public void settle(CaptureSequence.Shot shot,int ms){handler.postDelayed(()->sequence.settled(shot.request),ms);}
   public void capture(CaptureSequence.Shot shot){handler.post(CameraProbeActivity.this::awaitReady);}
   public void save(CaptureSequence.Shot shot,byte[] jpeg,long at){handler.post(()->{
    if(done||paused||sequence.state()!=CaptureSequence.State.SAVING)return;
    try{
     java.nio.file.Path saved=store.save(shot,jpeg,at);
     if(!java.util.Arrays.equals(jpeg,java.nio.file.Files.readAllBytes(saved.resolve("original.jpg"))))throw new java.io.IOException("JPEG mismatch");
     java.util.Properties metadata=new java.util.Properties();
     try(java.io.InputStream input=java.nio.file.Files.newInputStream(saved.resolve("capture.properties"))){metadata.load(input);}
     if(!shot.mode.key.equals(metadata.getProperty("mode"))||!String.valueOf(shot.request).equals(metadata.getProperty("requestId")))throw new java.io.IOException("Metadata mismatch");
     Log.i("VenusCameraProbe","SAVED index="+shot.index+" simulatedMode="+shot.mode.key+" bytes="+jpeg.length);
     sequence.saved(shot.request);
     if(sequence.state()==CaptureSequence.State.COMPLETE){store.complete(shot.record,shot.session);finishTest("PASS eight native JPEGs stored, reread and sealed; illumination simulated only");}
    }catch(Exception e){sequence.failed(shot.request);finishTest("FAIL store "+e.toString());}
   });}
  });
  sequence.start("diagnostic-"+System.currentTimeMillis(),"no-client",true);
 }
 private void awaitReady(){
  if(done||paused)return;
  if(!camera.isReady()){handler.postDelayed(this::awaitReady,50);return;}
  if(sequence.state()!=CaptureSequence.State.CAMERA){finishTest("FAIL sequence "+sequence.state());return;}
  final CaptureSequence.Shot shot=sequence.current();count++;
  camera.capture(shot.request,new NativeStillCamera.Result(){
   public void failed(long request,String reason){finishTest("FAIL "+reason);}
   public void jpeg(long request,byte[] bytes,long at,int width,int height,int rotation){
    BitmapFactory.Options bounds=new BitmapFactory.Options();bounds.inJustDecodeBounds=true;
    BitmapFactory.decodeByteArray(bytes,0,bytes.length,bounds);
    if(bounds.outWidth<=0||bounds.outHeight<=0){finishTest("FAIL JPEG decode");return;}
    Log.i("VenusCameraProbe","SHOT "+request+" bytes="+bytes.length+" configured="+width+"x"+height+" decoded="+bounds.outWidth+"x"+bounds.outHeight+" rotation="+rotation+" shutter="+at);
    sequence.jpeg(request,bytes,at);
   }
  });
  if(count==1&&getIntent().getBooleanExtra("testPause",false))runOnUiThread(this::finish);
 }
 private void finishTest(String message){
  if(done)return;done=true;
  if(bridge!=null)bridge.destroy();
  try{if(camera!=null)camera.close();}catch(Exception e){message="FAIL close "+e.toString();}
  if(sequence!=null&&sequence.state()!=CaptureSequence.State.COMPLETE)sequence.cancel();
  deadlines.shutdownNow();final String result=message;Log.i("VenusCameraProbe",result);runOnUiThread(()->text.setText(result));worker.quitSafely();
 }
 @Override protected void onPause(){
  paused=true;super.onPause();
  if(handler!=null&&!done)handler.post(()->finishTest("CANCELLED activity paused; camera released; shots="+count));
 }
}
