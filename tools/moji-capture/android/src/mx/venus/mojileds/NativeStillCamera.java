package mx.venus.mojileds;

import android.graphics.SurfaceTexture;
import android.hardware.Camera;
import android.os.Handler;
import android.os.Looper;
import java.io.IOException;

/** Camera1 JPEG acquisition. Owned by one looper; no GPIO or network operations. */
@SuppressWarnings("deprecation")
public final class NativeStillCamera {
 public interface Result {
  void jpeg(long request,byte[] data,long capturedAt,int width,int height,int rotation);
  void failed(long request,String reason);
 }
 private final Handler owner;private Camera camera;private SurfaceTexture surface;
 private long generation;private boolean capturing,ready;private int width,height,rotation;
 public NativeStillCamera(Handler owner){this.owner=owner;}
 private void requireOwner(){if(Looper.myLooper()!=owner.getLooper())throw new IllegalStateException("Camera owner thread required");}
 public void open(int rotation) throws IOException {
  requireOwner();close();
  if(rotation!=0&&rotation!=90&&rotation!=180&&rotation!=270)throw new IllegalArgumentException("Rotation");
  this.rotation=rotation;
  try{
   camera=Camera.open(0);Camera.Parameters p=camera.getParameters();
   Camera.Size best=null;
   for(Camera.Size size:p.getSupportedPictureSizes()){
    // Use the sensor's still-image path, never the lower-resolution preview JPEG.
    if(best==null||(long)size.width*size.height>(long)best.width*best.height)best=size;
   }
   if(best==null)throw new IOException("No still-image resolution");
   width=best.width;height=best.height;p.setPictureSize(width,height);p.setJpegQuality(93);p.setRotation(rotation);
   java.util.List<String> flash=p.getSupportedFlashModes();
   if(flash!=null&&flash.contains(Camera.Parameters.FLASH_MODE_OFF))p.setFlashMode(Camera.Parameters.FLASH_MODE_OFF);
   camera.setParameters(p);surface=new SurfaceTexture(0);camera.setPreviewTexture(surface);
   awaitPreview();camera.startPreview();
  }catch(Exception e){close();throw new IOException("Cannot open native camera",e);}
 }
 private void awaitPreview(){
  ready=false;final long token=generation;
  camera.setOneShotPreviewCallback((data,source)->{
   if(token==generation&&source==camera&&data!=null&&data.length>0)ready=true;
  });
 }
 public boolean isReady(){requireOwner();return camera!=null&&ready&&!capturing;}
 public void capture(long request,Result result){
  requireOwner();
  if(!isReady()){result.failed(request,"Camera preview not ready");return;}
  capturing=true;ready=false;final long token=++generation;final long[] shutter={0};
  owner.postDelayed(()->{if(token==generation&&capturing){close();result.failed(request,"JPEG timeout");}},5000);
  camera.setErrorCallback((error,unused)->{if(token==generation){close();result.failed(request,"Camera error "+error);}});
  try{
   camera.takePicture(()->shutter[0]=System.currentTimeMillis(),null,(data,source)->{
    if(token!=generation||!capturing)return;
    capturing=false;generation++;
    if(data==null||data.length==0||shutter[0]==0){close();result.failed(request,"Missing JPEG or shutter timestamp");return;}
    try{awaitPreview();source.startPreview();}catch(RuntimeException e){close();result.failed(request,"Preview restart failed");return;}
    result.jpeg(request,data,shutter[0],width,height,rotation);
   });
  }catch(RuntimeException e){close();result.failed(request,"Capture failed");}
 }
 public void close(){
  requireOwner();generation++;capturing=false;ready=false;
  Camera previous=camera;camera=null;
  SurfaceTexture previousSurface=surface;surface=null;
  try{
   if(previous!=null){
    try{previous.setOneShotPreviewCallback(null);previous.setErrorCallback(null);previous.stopPreview();}catch(RuntimeException ignored){}
    finally{previous.release();}
   }
  }finally{if(previousSurface!=null)previousSurface.release();}
 }
}
