package mx.venus.mojileds;
import android.system.Os;
import android.system.OsConstants;
import android.system.ErrnoException;
import java.io.FileDescriptor;
import java.io.IOException;
/** Preserves verified 0.6/0.7 write-only syscall behavior. Never read this node. */
public final class GpioWhitePort implements WhitePulse.Port {
 private static final String PATH="/sys/class/fise_gpio0/level";
 private final boolean supported;
 public GpioWhitePort(String model,String originalVersion){supported="RK3399-S9932".equalsIgnoreCase(model)&&"1.7.7".equals(originalVersion);}
 @Override public void write(char value)throws IOException {
  if(!supported || (value!='0' && value!='1'))throw new IOException("Salida no compatible");
  FileDescriptor fd=null;
  try {fd=Os.open(PATH,OsConstants.O_WRONLY | OsConstants.O_CLOEXEC,0); if(Os.write(fd,new byte[]{(byte)value},0,1)!=1)throw new IOException("Escritura incompleta");}
  catch(ErrnoException e){throw new IOException(e);}
  finally {if(fd!=null)try{Os.close(fd);}catch(ErrnoException e){throw new IOException(e);}}
 }
}
