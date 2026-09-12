package mx.venus.mojileds;
import java.io.IOException;
/** Serialized writes; timer is armed before ON. A failed OFF permanently locks out ON. */
public final class WhitePulse {
 public interface Port {void write(char value) throws IOException;}
 public interface Timer {void after(long ms,Runnable action);}
 private final Port port; private final Timer timer;
 private boolean active, failed; private long generation;
 public WhitePulse(Port port,Timer timer){this.port=port;this.timer=timer;}
 public synchronized boolean start(){
  if(active || failed)return false;
  active=true; final long token=++generation;
  try {timer.after(2000,()->expire(token));port.write('0');return true;}
  catch(Exception e){failed=true;off();return false;}
 }
 private synchronized void expire(long token){if(token==generation)off();}
 public synchronized void off(){
  if(!active)return;
  try {port.write('1');}catch(IOException e){failed=true;}
  active=false;generation++;
 }
}
