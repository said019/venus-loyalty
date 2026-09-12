package mx.venus.mojileds;
import java.net.URI;
public final class Policy {
 public static final String PAGE="https://venuscosmetologia.com.mx/captura.html?modo=analisis";
 public static boolean origin(String value) {
  try { URI u=new URI(value); return "https".equals(u.getScheme()) && "venuscosmetologia.com.mx".equals(u.getHost()) && u.getRawUserInfo()==null && (u.getPort()==-1 || u.getPort()==443); } catch(Exception e){return false;}
 }
 public static boolean document(String value) {
  return PAGE.equals(value);
 }
 public static boolean navigation(String value) {
  if(document(value))return true;
  try {return origin(value)&&"/skin-advisor.html".equals(new URI(value).getRawPath());}catch(Exception e){return false;}
 }
 public static boolean resource(String value) {
  if(origin(value))return true;
  try {URI u=new URI(value);return "https".equals(u.getScheme())&&"res.cloudinary.com".equals(u.getHost())&&u.getRawUserInfo()==null&&(u.getPort()==-1||u.getPort()==443);}catch(Exception e){return false;}
 }
 public static int white(String url,String current,boolean main,boolean gesture,boolean foreground) {
  if(!main || !gesture || !foreground || !document(current) || url==null || !url.matches("venus-moji://white\\?request=[1-9][0-9]{0,8}")) return 0;
  return Integer.parseInt(url.substring(url.indexOf('=')+1));
 }
 public static boolean off(String url,String current,boolean main) {return main && document(current) && "venus-moji://off".equals(url);}
}
