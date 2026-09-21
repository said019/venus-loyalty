package mx.venus.mojileds;

import android.os.Handler;
import android.os.HandlerThread;

/** Runs the full 8-shot light sequence with the native camera, off the UI thread. */
final class NativeSequenceCapture {
 interface Result {
  void shot(long sessionRequest,int index,String mode,byte[] jpeg);
  void finished(long sessionRequest,byte[][] jpeg,String[] modes,String error);
 }
 private final HandlerThread thread=new HandlerThread("VenusSequence");
 private final Handler handler;private final SequenceLeds leds;private final Result result;
 private NativeStillCamera camera;private volatile long generation;
 private byte[][] shots;private String[] modes;private int rotation;
 NativeSequenceCapture(SequenceLeds leds,Result result){this.leds=leds;this.result=result;thread.start();handler=new Handler(thread.getLooper());}
 synchronized void start(final long sessionRequest,final int rotation){
  final long token=++generation;this.rotation=rotation;
  shots=new byte[8][];modes=new String[8];
  handler.postDelayed(()->{
   if(token!=generation)return;
   try{if(camera!=null)camera.close();camera=new NativeStillCamera(handler);camera.open(rotation);step(token,sessionRequest,0,System.currentTimeMillis()+8000);}
   catch(Exception e){finish(token,sessionRequest,"No se pudo abrir la camara nativa.");}
  },400);
 }
 private void step(final long token,final long sessionRequest,final int index,final long readyDeadline){
  if(token!=generation)return;
  if(!camera.isReady()){
   if(System.currentTimeMillis()>readyDeadline){finish(token,sessionRequest,"La camara no entrego vista previa.");return;}
   handler.postDelayed(()->step(token,sessionRequest,index,readyDeadline),50);return;
  }
  final CaptureSequence.Mode mode=CaptureSequence.modeAt(index);
  synchronized(this){
   if(token!=generation)return;
   // Independent OFF watchdog fires well after the intended settle+capture window.
   if(!leds.on(mode.gpio,mode.settleMs+2000)){finish(token,sessionRequest,"No se pudo activar la luz.");return;}
  }
  final long onAt=System.currentTimeMillis();
  handler.postDelayed(()->take(token,sessionRequest,index,mode,onAt),mode.settleMs);
 }
 private void take(final long token,final long sessionRequest,final int index,final CaptureSequence.Mode mode,final long onAt){
  if(token!=generation)return;
  final int request=index+1;
  camera.capture(request,new NativeStillCamera.Result(){
   public void failed(long id,String reason){finish(token,sessionRequest,"La captura nativa fallo.");}
   public void jpeg(final long id,final byte[] bytes,final long shutter,int width,int height,int rot){
    handler.post(()->{
     if(token!=generation)return;
     if(shutter<onAt||shutter-onAt>mode.settleMs+1500){finish(token,sessionRequest,"La captura quedo fuera del pulso de luz.");return;}
     leds.offAll();
     shots[index]=bytes;modes[index]=mode.key;
     result.shot(sessionRequest,index,mode.key,bytes);
     if(index==7){finish(token,sessionRequest,null);return;}
     handler.postDelayed(()->step(token,sessionRequest,index+1,System.currentTimeMillis()+5000),250);
    });
   }
  });
 }
 private void finish(long token,long sessionRequest,String error){
  if(token!=generation)return;
  leds.forceOffAll();
  try{if(camera!=null)camera.close();}catch(Exception e){if(error==null)error="No se pudo liberar la camara."; }
  camera=null;
  result.finished(sessionRequest,error==null?shots:null,modes,error);
 }
 synchronized void cancel(){generation++;leds.forceOffAll();handler.post(()->{if(camera!=null){camera.close();camera=null;}});}
 void destroy(){cancel();thread.quitSafely();}
}
