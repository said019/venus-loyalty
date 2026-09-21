package mx.venus.mojileds;
/** Diagnostic replacement, never compiled into the production APK. No hardware I/O. */
final class GpioSequencePort implements SequenceLeds.Port {
 GpioSequencePort(String model,String original){}
 public void write(int gpio,char value){android.util.Log.i("VenusBridgeTest","SIMULATED GPIO"+gpio+"="+value);}
}
