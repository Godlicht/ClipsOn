import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from backend import server


class ServerTests(unittest.TestCase):
    def test_cancellation_cleanup_retries_windows_file_handle_release(self):
        with patch.object(Path, 'unlink', side_effect=[PermissionError(), None, None]) as unlink, patch.object(server.time, 'sleep'):
            self.assertTrue(server.cleanup_media(Path('unused')))
            self.assertEqual(unlink.call_count, 3)

    def test_completion_poll_always_contains_result_even_before_process_exit(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            result = {"segments": [], "language": "pl"}
            (directory / 'result.json').write_text(json.dumps(result), encoding='utf-8')
            (directory / 'status.json').write_text('{"state":"completed"}', encoding='utf-8')
            with patch.dict(server.manager.jobs, {'test': {"state": "processing", "directory": directory}}):
                response = server.get_transcription('test')
                self.assertEqual(response['result'], result)

    def test_job_ids_cannot_be_paths_and_second_upload_is_not_accepted(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(server, 'JOBS', Path(temp)):
            manager = server.JobManager()
            with self.assertRaises(HTTPException):
                manager.reserve('../outside')
            identifier, _ = manager.reserve('a' * 32)
            with self.assertRaises(HTTPException) as error:
                manager.reserve('b' * 32)
            self.assertEqual(error.exception.status_code, 409)
            manager.cancel(identifier)
            self.assertEqual(manager.jobs[identifier]['state'], 'cancelled')


if __name__ == '__main__':
    unittest.main()
