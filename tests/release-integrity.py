"""Offline tests for publication policy and public-package inspection."""
from pathlib import Path
import hashlib, importlib.util, io, json, sys, tempfile, unittest, zipfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from release_policy import assert_existing_release, verify_uploaded_assets
spec=importlib.util.spec_from_file_location('public_check',Path(__file__).resolve().parents[1]/'scripts/verify-public-release.py')
public=importlib.util.module_from_spec(spec);spec.loader.exec_module(public)
SHA='a'*40
class ReleaseTests(unittest.TestCase):
    def test_same_version_other_code_rejected(self):
        release={'assets':[{'name':'app.zip','state':'uploaded','digest':'sha256:'+'f'*64}]}
        with self.assertRaisesRegex(ValueError,'Increment'):assert_existing_release(release,{'object':{'sha':'b'*40,'type':'commit'}},SHA,{'app.zip'})
    def test_exact_published_source_is_idempotent_with_full_checks(self):
        release={'assets':[{'name':'app.zip','state':'uploaded','digest':'sha256:'+'f'*64}]}
        assert_existing_release(release,{'object':{'sha':SHA,'type':'commit','url':'extra'}},SHA,{'app.zip'})
        with self.assertRaises(ValueError):assert_existing_release(release,None,SHA,{'app.zip'})
        with self.assertRaises(ValueError):assert_existing_release(release,{'object':{'sha':SHA,'type':'tag'}},SHA,{'app.zip'})
        with self.assertRaises(ValueError):assert_existing_release(release,{'object':{'sha':SHA,'type':'commit'}},SHA,{'other.zip'})
    def test_uploaded_sizes_and_hashes(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'app.zip';p.write_bytes(b'bytes')
            asset={'name':'app.zip','state':'uploaded','size':5,'digest':'sha256:'+hashlib.sha256(b'bytes').hexdigest()}
            verify_uploaded_assets({'assets':[asset]},{'app.zip':p})
            p.write_bytes(b'wrong')
            with self.assertRaises(ValueError):verify_uploaded_assets({'assets':[asset]},{'app.zip':p})
    def test_browser_zip_requires_ready_html_and_exact_provenance(self):
        def package(commit=SHA,extra=None):
            stream=io.BytesIO()
            with zipfile.ZipFile(stream,'w') as z:
                hashes={name:hashlib.sha256(data).hexdigest() for name,data in [('index.html',b'<html>test</html>'),('diagnostic.html',b'diagnostic')]}
                for name,data in [('index.html',b'<html>test</html>'),('diagnostic.html',b'diagnostic')]:z.writestr('gin-schnaps-0.8.2/'+name,data)
                z.writestr('gin-schnaps-0.8.2/BUILD.json',json.dumps({'version':'0.8.2','commit':commit,'sha256':hashes}))
                if extra:z.writestr(extra,'payload')
            return stream.getvalue()
        public.inspect_package('gin-schnaps-0.8.2-browser.zip',package(),'0.8.2',SHA)
        with self.assertRaises(ValueError):public.inspect_package('gin-schnaps-0.8.2-browser.zip',package('b'*40),'0.8.2',SHA)
        with self.assertRaises(ValueError):public.inspect_package('gin-schnaps-0.8.2-browser.zip',package(extra='../unsafe'),'0.8.2',SHA)
        with self.assertRaises(ValueError):public.inspect_package('gin-schnaps-0.8.2-browser.zip',package(extra='gin-schnaps-0.8.2/sources/test'),'0.8.2',SHA)
    def test_html_404_body_cannot_masquerade_as_download(self):
        with self.assertRaises(zipfile.BadZipFile):public.inspect_package('gin-schnaps-0.8.2-browser.zip',b'<html>404</html>','0.8.2',SHA)
        with self.assertRaises(ValueError):public.inspect_package('gin-schnaps-0.8.2-macos-intel.dmg',b'not a disk image','0.8.2',SHA)
    def test_unsafe_archive_names_rejected(self):
        for name in ['../outside','/absolute','C:/windows','a\\b','a/../../b']:
            with self.assertRaises(ValueError):public.safe_member(name)
        public.safe_member('gin-schnaps-0.8.2/index.html')
    def test_public_checker_does_not_add_authorization(self):
        # Network is deliberately absent from these unit tests. The real public
        # download check is a separate post-publication read-only CI job.
        import inspect
        s=inspect.getsource(public.download)
        self.assertNotIn('Authorization',s)
        self.assertNotIn('os.environ',s)
if __name__=='__main__':unittest.main()
