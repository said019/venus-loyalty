const form=document.querySelector('#login'),error=document.querySelector('#error');
form.addEventListener('submit',async event=>{
 event.preventDefault();const button=form.querySelector('button');button.disabled=true;error.textContent='';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch('/api/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.querySelector('#email').value.trim(),password:document.querySelector('#password').value}),signal:controller.signal});
 document.querySelector('#password').value='';
 if(!response.ok)throw Error('No se pudo iniciar sesión. Revisa tus datos.');
 const access=await fetch('/mi-plan/session',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
 if(!access.ok)throw Error('Esta cuenta no tiene acceso a tu espacio personal.');
 location.replace('/mi-plan/');
 }catch(e){error.textContent=e.name==='AbortError'?'La conexión tardó demasiado. Inténtalo de nuevo.':e.message||'No se pudo conectar.';}finally{clearTimeout(timer);button.disabled=false;}
});
