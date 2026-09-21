package mx.venus.mojileds;
import java.io.IOException;
/** Multi-channel write-only light control. Every ON arms an independent OFF watchdog first. */
public final class SequenceLeds {
 public interface Port { void write(int gpio, char value) throws IOException; }
 public interface Timer { void after(int ms, Runnable action); }
 private static final int[] CHANNELS={0,1,2,3,4,5};
 private final Port port; private final Timer timer;
 private int active=-1; private boolean failed; private long generation;
 public SequenceLeds(Port port,Timer timer){this.port=port;this.timer=timer;}
 public synchronized boolean on(int gpio,int maxMs){
  if(failed)return false;
  if(!allowed(gpio))return false;
  final long token=++generation;
  try{
   offAllLocked();
   timer.after(maxMs,()->expire(token,gpio));
   port.write(gpio,'0');active=gpio;return true;
  }catch(Exception e){failed=true;forceOffAll();return false;}
 }
 private synchronized void expire(long token,int gpio){
  if(token!=generation||active!=gpio)return;
  forceOffAll();
 }
 public synchronized void offAll(){
  try{offAllLocked();active=-1;generation++;}catch(IOException e){failed=true;active=-1;generation++;}
 }
 /** Lifecycle/manual paths must attempt OFF on every channel even if some writes fail. */
 public synchronized void forceOffAll(){
  IOException first=null;
  for(int channel:CHANNELS){try{port.write(channel,'1');}catch(IOException e){if(first==null)first=e;}}
  active=-1;generation++;
  if(first!=null)failed=true;
 }
 private void offAllLocked()throws IOException{
  for(int channel:CHANNELS)if(channel!=active)port.write(channel,'1');
  if(active>=0){port.write(active,'1');active=-1;}
 }
 private static boolean allowed(int gpio){for(int c:CHANNELS)if(c==gpio)return true;return false;}
 public synchronized boolean isFailed(){return failed;}
 public synchronized int active(){return active;}
}
