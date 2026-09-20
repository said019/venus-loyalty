package mx.venus.mojileds;

import android.os.Handler;
import android.os.HandlerThread;

/** Native still JPEG for the validated white channel. Other channels stay disabled. */
final class NativeWhiteCapture {
 interface Result {void finished(int request,byte[] jpeg,String error);}
 private final HandlerThread thread=new HandlerThread("VenusStill");
 private final Handler handler;private final WhitePulse pulse;private final Result result;
 private NativeStillCamera camera;private volatile long generation;
 NativeWhiteCapture(WhitePulse pulse,Result result){this.pulse=pulse;this.result=result;thread.start();handler=new Handler(thread.getLooper());}
 synchronized void start(int request,int rotation){
  final long token=++generation;
  handler.postDelayed(()->{
   if(token!=generation)return;
   try{if(camera!=null)camera.close();camera=new NativeStillCamera(handler);camera.open(rotation);ready(token,request,System.currentTimeMillis()+5000);}
   catch(Exception e){finish(token,request,null,"No se pudo abrir la camara nativa.");}
  },400);
 }
 private void ready(long token,int request,long deadline){
  if(token!=generation)return;
  if(!camera.isReady()){
   if(System.currentTimeMillis()>deadline){finish(token,request,null,"La camara no entrego vista previa.");return;}
   handler.postDelayed(()->ready(token,request,deadline),50);return;
  }
  synchronized(this){
   if(token!=generation)return;
   if(!pulse.start()){finish(token,request,null,"No se pudo activar la luz blanca.");return;}
  }
  final long onAt=System.currentTimeMillis();
  handler.postDelayed(()->{
   if(token!=generation)return;
   camera.capture(request,new NativeStillCamera.Result(){
    public void failed(long id,String reason){finish(token,request,null,"La captura nativa fallo.");}
    public void jpeg(long id,byte[] bytes,long shutter,int width,int height,int rotation){
     if(shutter<onAt||shutter-onAt>1800){finish(token,request,null,"La captura quedo fuera del pulso de luz.");return;}
     finish(token,request,bytes,null);
    }
   });
  },250);
 }
 private void finish(long token,int request,byte[] jpeg,String error){
  if(token!=generation)return;
  pulse.forceOff();
  try{if(camera!=null)camera.close();}catch(Exception e){jpeg=null;error="No se pudo liberar la camara.";}
  camera=null;result.finished(request,jpeg,error);
 }
 synchronized void cancel(){generation++;pulse.forceOff();handler.post(()->{if(camera!=null){camera.close();camera=null;}});}
 void destroy(){cancel();thread.quitSafely();}
}
