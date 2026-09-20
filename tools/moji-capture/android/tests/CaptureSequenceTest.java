package mx.venus.mojileds;
import java.util.*;
public final class CaptureSequenceTest {
 static int checks;
 static void check(boolean v){checks++;if(!v)throw new AssertionError("sequence check "+checks);}
 static class Fake implements CaptureSequence.Port {
  List<String> actions=new ArrayList<>(), files=new ArrayList<>(); boolean failOff;
  List<Runnable> deadlines=new ArrayList<>();
  public void after(int ms,Runnable action){check(ms>0);deadlines.add(action);}
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
  for(int phase=0;phase<4;phase++){
   Fake stalled=new Fake();CaptureSequence seq=new CaptureSequence(stalled);check(seq.start("timeout","record",true));
   long request=seq.current().request;
   if(phase>=1)seq.lit(request);
   if(phase>=2)seq.settled(request);
   if(phase>=3)seq.jpeg(request,jpg,1);
   stalled.deadlines.get(phase).run();check(seq.state()==CaptureSequence.State.FAILED);
   check(stalled.actions.get(stalled.actions.size()-1).equals("off"));
   seq.saved(request);check(seq.state()==CaptureSequence.State.FAILED);
   check(!seq.start("again","record",true));
  }
  for(int phase=0;phase<4;phase++){
   Fake cancelled=new Fake();CaptureSequence seq=new CaptureSequence(cancelled);check(seq.start("cancel","record",true));long request=seq.current().request;
   if(phase>=1)seq.lit(request);if(phase>=2)seq.settled(request);if(phase>=3)seq.jpeg(request,jpg,1);
   seq.cancel();int countBefore=cancelled.files.size();
   seq.lit(request);seq.settled(request);seq.jpeg(request,jpg,1);seq.saved(request);
   for(Runnable deadline:cancelled.deadlines)deadline.run();
   check(seq.state()==CaptureSequence.State.CANCELLED);check(cancelled.files.size()==countBefore);
   check(seq.start("new","record",true));
   for(Runnable deadline:new ArrayList<>(cancelled.deadlines.subList(0,cancelled.deadlines.size()-1)))deadline.run();
   check(seq.state()==CaptureSequence.State.LIGHT);
  }
  Fake invalid=new Fake();CaptureSequence invalidSeq=new CaptureSequence(invalid);invalidSeq.start("bad","record",true);
  long bad=invalidSeq.current().request;invalidSeq.lit(bad);invalidSeq.settled(bad);invalidSeq.jpeg(bad,new byte[]{0,1,2,3},1);
  check(invalidSeq.state()==CaptureSequence.State.FAILED);check(invalid.files.isEmpty());
  java.nio.file.Path temp=java.nio.file.Files.createTempDirectory("venus-capture-test");
  try{
   CaptureStore store=new CaptureStore(temp);java.nio.file.Path saved=store.save(s.current(),jpg,123);
   check(Arrays.equals(jpg,java.nio.file.Files.readAllBytes(saved.resolve("original.jpg"))));
   Properties properties=new Properties();try(java.io.InputStream in=java.nio.file.Files.newInputStream(saved.resolve("capture.properties"))){properties.load(in);}
   check(properties.getProperty("recordId").equals("third"));check(properties.getProperty("sessionId").equals("c"));
   check(properties.getProperty("mode").equals("image"));check(properties.getProperty("capturedAt").equals("123"));
   boolean duplicate=false;try{store.save(s.current(),jpg,124);}catch(java.io.IOException e){duplicate=true;}check(duplicate);
   boolean partial=false;try{store.complete("third","c");}catch(java.io.IOException e){partial=true;}check(partial);
   check(!java.nio.file.Files.exists(temp.resolve("third/c/complete.properties")));
   Fake fullPort=new Fake();CaptureSequence full=new CaptureSequence(fullPort);full.start("full","record",true);
   for(int i=0;i<8;i++){
    CaptureSequence.Shot next=full.current();store.save(next,jpg,100+i);
    full.lit(next.request);full.settled(next.request);full.jpeg(next.request,jpg,100+i);full.saved(next.request);
   }
   java.nio.file.Path manifest=store.complete("record","full");Properties sealed=new Properties();
   try(java.io.InputStream in=java.nio.file.Files.newInputStream(manifest)){sealed.load(in);}
   check(sealed.getProperty("count").equals("8"));check(sealed.getProperty("7.mode").equals("image"));
   check(sealed.getProperty("0.sha256").length()==64);
  }finally{try(java.util.stream.Stream<java.nio.file.Path> files=java.nio.file.Files.walk(temp)){for(java.nio.file.Path file:(Iterable<java.nio.file.Path>)files.sorted(Comparator.reverseOrder())::iterator)java.nio.file.Files.delete(file);}}
  System.out.println("PASS "+checks+" sequence checks (simulated hardware only)");
 }
}
