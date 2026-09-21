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
  if(!main || !gesture || !foreground || !document(current)) return 0;
  return whiteRequest(url);
 }
 public static int whiteRequest(String url) {
  if(url==null || !url.matches("venus-moji://white\\?request=[1-9][0-9]{0,8}")) return 0;
  return Integer.parseInt(url.substring(url.indexOf('=')+1));
 }
 public static int stillRequest(String url){
  if(url==null||!url.matches("venus-moji://still\\?request=[1-9][0-9]{0,8}&rotation=(0|90|180|270)"))return 0;
  return Integer.parseInt(url.substring(url.indexOf('=')+1,url.indexOf('&')));
 }
 public static long sequenceRequest(String url){
  if(url==null||!url.matches("venus-moji://sequence\\?request=[1-9][0-9]{0,8}&rotation=(0|90|180|270)&record=[A-Za-z0-9_-]{1,120}"))return 0;
  return Long.parseLong(url.substring(url.indexOf('=')+1,url.indexOf('&')));
 }
 public static int sequenceRotation(String url){try{return Integer.parseInt(url.replaceAll(".*rotation=(0|90|180|270).*","$1"));}catch(Exception e){return 90;}}
 public static String sequenceRecord(String url){try{return url.replaceAll(".*record=","");}catch(Exception e){return "";}}
 public static boolean off(String url,String current,boolean main) {return main && document(current) && "venus-moji://off".equals(url);}
}
