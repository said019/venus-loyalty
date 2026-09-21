package mx.venus.mojileds;
import android.system.Os;
import android.system.OsConstants;
import android.system.ErrnoException;
import java.io.FileDescriptor;
import java.io.IOException;
/** Write-only access to the six validated light channels. Never read these nodes. */
public final class GpioSequencePort implements SequenceLeds.Port {
 private final boolean supported;
 public GpioSequencePort(String model,String originalVersion){supported="RK3399-S9932".equalsIgnoreCase(model)&&"1.7.7".equals(originalVersion);}
 @Override public void write(int gpio,char value)throws IOException {
  if(!supported || gpio<0 || gpio>5 || (value!='0' && value!='1'))throw new IOException("Salida no compatible");
  FileDescriptor fd=null;
  try{fd=Os.open("/sys/class/fise_gpio"+gpio+"/level",OsConstants.O_WRONLY | OsConstants.O_CLOEXEC,0);if(Os.write(fd,new byte[]{(byte)value},0,1)!=1)throw new IOException("Escritura incompleta");}
  catch(ErrnoException e){throw new IOException(e);}
  finally{if(fd!=null)try{Os.close(fd);}catch(ErrnoException e){throw new IOException(e);}}
 }
}
