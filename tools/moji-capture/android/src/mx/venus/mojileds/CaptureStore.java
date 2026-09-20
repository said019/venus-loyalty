package mx.venus.mojileds;
import java.io.*;
import java.nio.file.*;
import java.util.Properties;

/** App-private storage: publish the original JPEG and its identity as one directory. */
public final class CaptureStore {
 private final Path root;
 public CaptureStore(Path root){this.root=root;}
 public synchronized Path save(CaptureSequence.Shot shot,byte[] jpeg,long capturedAt) throws IOException {
  if(jpeg==null||jpeg.length<4||capturedAt<=0)throw new IOException("Invalid capture");
  Path parent=root.resolve(shot.record).resolve(shot.session);Files.createDirectories(parent);
  Path destination=parent.resolve(shot.index+"-"+shot.mode.key);
  if(Files.exists(destination))throw new IOException("Capture already saved");
  Path staging=Files.createTempDirectory(parent,".pending-");
  try{
   try(FileOutputStream out=new FileOutputStream(staging.resolve("original.jpg").toFile())){out.write(jpeg);out.getFD().sync();}
   Properties metadata=new Properties();
   metadata.setProperty("recordId",shot.record);metadata.setProperty("sessionId",shot.session);
   metadata.setProperty("mode",shot.mode.key);metadata.setProperty("index",String.valueOf(shot.index));
   metadata.setProperty("requestId",String.valueOf(shot.request));metadata.setProperty("capturedAt",String.valueOf(capturedAt));
   try(FileOutputStream out=new FileOutputStream(staging.resolve("capture.properties").toFile())){metadata.store(out,"Venus original capture");out.getFD().sync();}
   // No non-atomic fallback: partial image/metadata pairs must never look complete.
   Files.move(staging,destination,StandardCopyOption.ATOMIC_MOVE);
   return destination;
  }finally{
   if(Files.exists(staging)){Files.deleteIfExists(staging.resolve("original.jpg"));Files.deleteIfExists(staging.resolve("capture.properties"));Files.deleteIfExists(staging);}
  }
 }
}
