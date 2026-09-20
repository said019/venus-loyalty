package mx.venus.mojileds;
import java.io.*;
import java.nio.file.*;
import java.util.Properties;

/** App-private storage: publish the original JPEG and its identity as one directory. */
public final class CaptureStore {
 private final Path root;
 public CaptureStore(Path root){this.root=root;}
 /** Seal only a complete, internally consistent set; partial sessions stay unsealed. */
 public synchronized Path complete(String record,String session) throws IOException {
  if(record==null||session==null||!record.matches("[A-Za-z0-9_-]{1,120}")||!session.matches("[A-Za-z0-9_-]{1,120}"))throw new IOException("Invalid identity");
  Path parent=root.resolve(record).resolve(session);Properties manifest=new Properties();
  java.util.Set<String> requests=new java.util.HashSet<>();
  for(int i=0;i<8;i++){
   String mode=CaptureSequence.modeAt(i).key;
   Path directory=parent.resolve(i+"-"+mode);Properties metadata=new Properties();
   try(InputStream in=Files.newInputStream(directory.resolve("capture.properties"))){metadata.load(in);}
   if(!record.equals(metadata.getProperty("recordId"))||!session.equals(metadata.getProperty("sessionId"))||!mode.equals(metadata.getProperty("mode"))||!String.valueOf(i).equals(metadata.getProperty("index")))throw new IOException("Capture identity mismatch");
   try{
    if(Long.parseLong(metadata.getProperty("capturedAt"))<=0||Long.parseLong(metadata.getProperty("requestId"))<=0||!requests.add(metadata.getProperty("requestId")))throw new IOException("Invalid capture metadata");
   }catch(NumberFormatException e){throw new IOException("Invalid capture metadata",e);}
   byte[] bytes=Files.readAllBytes(directory.resolve("original.jpg"));
   if(bytes.length<4||(bytes[0]&255)!=255||(bytes[1]&255)!=216||(bytes[bytes.length-2]&255)!=255||(bytes[bytes.length-1]&255)!=217)throw new IOException("Invalid JPEG");
   try{
    byte[] digest=java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
    StringBuilder hex=new StringBuilder();for(byte b:digest)hex.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
    manifest.setProperty(i+".sha256",hex.toString());
   }catch(java.security.NoSuchAlgorithmException e){throw new IOException(e);}
   manifest.setProperty(i+".mode",mode);manifest.setProperty(i+".bytes",String.valueOf(bytes.length));
  }
  manifest.setProperty("recordId",record);manifest.setProperty("sessionId",session);manifest.setProperty("count","8");
  Path staging=Files.createTempFile(parent,".complete-",".pending");
  try{
   try(FileOutputStream out=new FileOutputStream(staging.toFile())){manifest.store(out,"Venus complete capture set");out.getFD().sync();}
   Path destination=parent.resolve("complete.properties");Files.move(staging,destination,StandardCopyOption.ATOMIC_MOVE);return destination;
  }finally{Files.deleteIfExists(staging);}
 }
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
