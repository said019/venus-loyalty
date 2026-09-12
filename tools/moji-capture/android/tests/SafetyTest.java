package mx.venus.mojileds;
import java.io.IOException;
public final class SafetyTest {
 static int count;
 static void check(boolean b) { count++; if(!b) throw new AssertionError("check "+count); }
 public static void main(String[] args) throws Exception {
  String page="https://venuscosmetologia.com.mx/captura.html?modo=analisis";
  check(Policy.document(page));
  check(Policy.navigation(page));
  check(Policy.navigation("https://venuscosmetologia.com.mx/skin-advisor.html?clientId=123"));
  check(!Policy.document("https://venuscosmetologia.com.mx/skin-advisor.html?clientId=123"));
  check(!Policy.document("https://venuscosmetologia.com.mx/captura.html?modo=other"));
  for(String s:new String[]{"https://res.cloudinary.com/skin-advisor.html","https://venuscosmetologia.com.mx/other.html","https://x@venuscosmetologia.com.mx/skin-advisor.html","https://venuscosmetologia.com.mx:444/skin-advisor.html","https://venuscosmetologia.com.mx/%73kin-advisor.html"})check(!Policy.navigation(s));
  for(String s:new String[]{"http://venuscosmetologia.com.mx/captura.html","https://evil.test/captura.html","https://venuscosmetologia.com.mx.evil/captura.html","https://x@venuscosmetologia.com.mx/captura.html","https://venuscosmetologia.com.mx:444/captura.html","https://venuscosmetologia.com.mx/%63aptura.html"}) check(!Policy.document(s));
  check(Policy.white("venus-moji://white?request=23",page,true,true,true)==23);
  for(String s:new String[]{"venus-moji://white","venus-moji://white?request=0","venus-moji://white?request=-1","venus-moji://white?request=1&x=1","venus-moji://white?request=1000000000","venus-moji://white?request=1#x"}) check(Policy.white(s,page,true,true,true)==0);
  check(Policy.white("venus-moji://white?request=1",page,false,true,true)==0);
  check(Policy.white("venus-moji://white?request=1",page,true,false,true)==0);
  check(Policy.white("venus-moji://white?request=1",page,true,true,false)==0);
  check(Policy.off("venus-moji://off",page,true)); check(!Policy.off("venus-moji://off",page,false));
  check(!Policy.resource("file:///etc/passwd")); check(!Policy.resource("venus-moji://white?request=1"));
  check(Policy.resource("https://venuscosmetologia.com.mx/asesora.html"));
  check(Policy.resource("https://res.cloudinary.com/venus/image/upload/photo.jpg"));
  check(!Policy.document("https://res.cloudinary.com/captura.html"));
  check(!Policy.origin("https://res.cloudinary.com/"));
  check(Policy.white("venus-moji://white?request=1","https://res.cloudinary.com/captura.html",true,true,true)==0);
  for(String s:new String[]{"http://res.cloudinary.com/photo.jpg","https://x@res.cloudinary.com/photo.jpg","https://res.cloudinary.com:444/photo.jpg","https://res.cloudinary.com.evil/photo.jpg","javascript:alert(1)","content://photos/1","data:text/html,hello"})check(!Policy.resource(s));
  final StringBuilder writes=new StringBuilder(); final Runnable[] deadline={null};
  WhitePulse pulse=new WhitePulse(v->writes.append(v),(ms,r)->{check(ms==2000);deadline[0]=r;});
  check(pulse.start()); check(!pulse.start()); check(writes.toString().equals("0"));
  deadline[0].run(); check(writes.toString().equals("01"));
  check(pulse.start()); pulse.off(); check(writes.toString().equals("0101"));
  deadline[0].run(); check(writes.toString().equals("0101"));
  WhitePulse failed=new WhitePulse(v->{throw new IOException("test");},(ms,r)->{});
  check(!failed.start()); check(!failed.start());
  System.out.println("PASS "+count+" safety checks");
 }
}
