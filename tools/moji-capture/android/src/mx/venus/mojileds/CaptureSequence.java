package mx.venus.mojileds;

/** Pure capture state machine. No GPIO access: hardware adapters require separate validation. */
public final class CaptureSequence {
 public enum Mode {
  WHITE("image",0,1000), POSITIVE("image_positive",4,1400),
  UV("image_uv",5,2500), WOODS("image_woods",2,1400),
  NEGATIVE("image_negative",1,1300), BLUE("image_blue",3,1000);
  public final String key; public final int gpio, settleMs;
  Mode(String key,int gpio,int settleMs){this.key=key;this.gpio=gpio;this.settleMs=settleMs;}
 }
 private static final Mode[] ORDER={Mode.WHITE,Mode.POSITIVE,Mode.UV,Mode.WOODS,Mode.NEGATIVE,Mode.BLUE,Mode.WHITE,Mode.WHITE};
 public enum State { IDLE, LIGHT, SETTLING, CAMERA, SAVING, COMPLETE, FAILED, CANCELLED }
 public static final class Shot {
  public final String session, record; public final long request;
  public final int index; public final Mode mode;
  private Shot(String session,String record,long request,int index){this.session=session;this.record=record;this.request=request;this.index=index;this.mode=ORDER[index];}
  public String filename(){return session+"-"+index+"-"+mode.key+".jpg";}
 }
 public interface Port {
  // Must arm an independent OFF watchdog BEFORE ON, and acknowledge successful writes.
  void light(Shot shot) throws Exception;
  void off() throws Exception;
  void settle(Shot shot,int milliseconds) throws Exception;
  void capture(Shot shot) throws Exception;
  // Adapter must persist JPEG and Shot metadata together before saved() acknowledgement.
  void save(Shot shot,byte[] jpeg,long capturedAt) throws Exception;
 }
 private final Port port; private State state=State.IDLE; private Shot shot;
 private long nextRequest; private boolean locked;
 public CaptureSequence(Port port){this.port=port;}
 public synchronized State state(){return state;}
 public synchronized Shot current(){return shot;}
 public synchronized boolean start(String session,String record,boolean profileValidated){
  if(!profileValidated||locked||!(state==State.IDLE||state==State.COMPLETE||state==State.CANCELLED))return false;
  if(session==null||!session.matches("[A-Za-z0-9_-]{1,120}")||record==null||!record.matches("[A-Za-z0-9_-]{1,120}"))return false;
  shot=new Shot(session,record,++nextRequest,0);
  return begin();
 }
 private boolean begin(){
  state=State.LIGHT;
  try{port.off();port.light(shot);return true;}catch(Exception e){fail();return false;}
 }
 private boolean accepts(long request,State expected){return shot!=null&&shot.request==request&&state==expected;}
 public synchronized void lit(long request){
  if(!accepts(request,State.LIGHT))return;
  state=State.SETTLING;
  try{port.settle(shot,shot.mode.settleMs);}catch(Exception e){fail();}
 }
 public synchronized void settled(long request){
  if(!accepts(request,State.SETTLING))return;
  state=State.CAMERA;
  try{port.capture(shot);}catch(Exception e){fail();}
 }
 public synchronized void jpeg(long request,byte[] data,long capturedAt){
  if(!accepts(request,State.CAMERA))return;
  if(data==null||data.length<4||(data[0]&255)!=255||(data[1]&255)!=216||(data[data.length-2]&255)!=255||(data[data.length-1]&255)!=217||capturedAt<=0){fail();return;}
  state=State.SAVING;
  try{port.off();port.save(shot,data.clone(),capturedAt);}catch(Exception e){fail();}
 }
 public synchronized void saved(long request){
  if(!accepts(request,State.SAVING))return;
  if(shot.index==ORDER.length-1){state=State.COMPLETE;return;}
  shot=new Shot(shot.session,shot.record,++nextRequest,shot.index+1);begin();
 }
 public synchronized void failed(long request){if(shot!=null&&shot.request==request&&state!=State.COMPLETE&&state!=State.CANCELLED)fail();}
 private void fail(){state=State.FAILED;locked=true;try{port.off();}catch(Exception ignored){/* Adapter reports physical OFF failure; never allow another ON. */}}
 public synchronized void cancel(){state=State.CANCELLED;try{port.off();}catch(Exception e){locked=true;state=State.FAILED;}}
}
