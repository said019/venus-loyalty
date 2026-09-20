package mx.venus.mojileds;
import java.util.*;
public final class CaptureSequenceTest {
 static int checks;
 static void check(boolean v){checks++;if(!v)throw new AssertionError("sequence check "+checks);}
 static class Fake implements CaptureSequence.Port {
  List<String> actions=new ArrayList<>(), files=new ArrayList<>(); boolean failOff;
  public void light(CaptureSequence.Shot s){actions.add("light:"+s.mode.gpio);}
  public void off() throws Exception{actions.add("off");if(failOff)throw new Exception("OFF");}
  public void settle(CaptureSequence.Shot s,int ms){actions.add("settle:"+ms);}
  public void capture(CaptureSequence.Shot s){actions.add("capture:"+s.request);}
  public void save(CaptureSequence.Shot s,byte[] jpg,long time){files.add(s.filename());actions.add("save");}
 }
 public static void main(String[] args) throws Exception{
  Fake p=new Fake();CaptureSequence s=new CaptureSequence(p);
  check(!s.start("a","record",false));check(p.actions.isEmpty());
  check(!s.start("../a","record",true));check(s.start("a","record",true));
  check(!s.start("b","other",true));
  int[] gpios={0,4,5,2,1,3,0,0};
  byte[] jpg={(byte)255,(byte)216,(byte)255,(byte)217};
  for(int i=0;i<8;i++){
   CaptureSequence.Shot shot=s.current();check(shot.index==i&&shot.mode.gpio==gpios[i]);
   s.jpeg(shot.request,jpg,1);check(p.files.size()==i);
   s.lit(shot.request);s.settled(shot.request);
   s.jpeg(shot.request+99,jpg,1);check(p.files.size()==i);
   s.jpeg(shot.request,jpg,1);check(s.state()==CaptureSequence.State.SAVING);
   check(p.actions.get(p.actions.size()-2).equals("off"));
   s.jpeg(shot.request,jpg,1);check(p.files.size()==i+1);
   s.saved(shot.request);s.saved(shot.request);
  }
  check(s.state()==CaptureSequence.State.COMPLETE);check(new HashSet<>(p.files).size()==8);
  check(s.start("b","other",true));long old=s.current().request;s.cancel();
  check(s.start("c","third",true));s.lit(old);check(s.state()==CaptureSequence.State.LIGHT);
  s.failed(old);check(s.state()==CaptureSequence.State.LIGHT);
  s.failed(s.current().request);check(s.state()==CaptureSequence.State.FAILED);check(!s.start("d","fourth",true));
  Fake broken=new Fake();broken.failOff=true;CaptureSequence b=new CaptureSequence(broken);
  check(!b.start("a","record",true));check(!broken.actions.contains("light:0"));
  java.nio.file.Path temp=java.nio.file.Files.createTempDirectory("venus-capture-test");
  try{
   CaptureStore store=new CaptureStore(temp);java.nio.file.Path saved=store.save(s.current(),jpg,123);
   check(Arrays.equals(jpg,java.nio.file.Files.readAllBytes(saved.resolve("original.jpg"))));
   Properties properties=new Properties();try(java.io.InputStream in=java.nio.file.Files.newInputStream(saved.resolve("capture.properties"))){properties.load(in);}
   check(properties.getProperty("recordId").equals("third"));check(properties.getProperty("sessionId").equals("c"));
   check(properties.getProperty("mode").equals("image"));check(properties.getProperty("capturedAt").equals("123"));
   boolean duplicate=false;try{store.save(s.current(),jpg,124);}catch(java.io.IOException e){duplicate=true;}check(duplicate);
  }finally{try(java.util.stream.Stream<java.nio.file.Path> files=java.nio.file.Files.walk(temp)){for(java.nio.file.Path file:(Iterable<java.nio.file.Path>)files.sorted(Comparator.reverseOrder())::iterator)java.nio.file.Files.delete(file);}}
  System.out.println("PASS "+checks+" sequence checks (simulated hardware only)");
 }
}
