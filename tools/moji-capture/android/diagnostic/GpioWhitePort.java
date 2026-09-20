package mx.venus.mojileds;

/** Diagnostic replacement, never compiled into the production APK. No hardware I/O. */
final class GpioWhitePort implements WhitePulse.Port {
 GpioWhitePort(String model,String original){}
 public void write(char value){android.util.Log.i("VenusBridgeTest","SIMULATED GPIO="+value);}
}
