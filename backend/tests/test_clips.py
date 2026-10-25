import json
import unittest
from backend.highlights import validate_analysis, build_candidates, choose_diverse, parse_ranking, editorial_score, ranking_items
from backend.clip_export import validate_export, cut_captions


def transcript(text, start=0, step=.65):
    words=[{'text':word,'start':start+i*step,'end':start+i*step+.5} for i,word in enumerate(text.split())]
    return {'duration':words[-1]['end']+.3,'segments':[{'words':words}]}


class HighlightTests(unittest.TestCase):
    def test_cuts_use_source_boundaries_and_do_not_fill_silence(self):
        data=transcript('Dlaczego to działa? Wystarczy zmienić jedną rzecz. To jest najważniejszy błąd początkujących. Ale można go łatwo uniknąć.',3600)
        options=validate_analysis({'transcript':data,'minDuration':5,'maxDuration':15,'engine':'fast'})
        candidates=build_candidates(options)
        self.assertTrue(candidates)
        for item in candidates:
            self.assertGreaterEqual(item['start'],3599.88)
            self.assertLessEqual(item['end'],data['duration'])
            self.assertLessEqual(item['end']-item['start'],15)

    def test_no_duplicate_or_heavily_overlapping_proposals(self):
        candidates=[{'id':str(i),'start':start,'end':start+20,'text':str(i),'score':100-i} for i,start in enumerate([0,1,2,30,60])]
        self.assertEqual([item['id'] for item in choose_diverse(candidates,5)],['0','3','4'])

    def test_model_cannot_invent_timestamps_or_unknown_clip_ids(self):
        candidates=[{'id':'moment-1','start':123.4,'end':145.6,'text':'Prawdziwy tekst','title':'Tytuł'}]
        raw=json.dumps({'moments':[{'id':'fake','score':100,'title':'Fałsz','reason':'Fałsz'},
            {'id':'moment-1','score':85,'title':'Tytuł','reason':'Opis','start':999}]})
        result=parse_ranking(raw,candidates)
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]['start'],123.4)
        self.assertEqual(result[0]['end'],145.6)
        self.assertEqual(parse_ranking('not JSON',candidates),[])
        self.assertEqual(parse_ranking('{"moments":[{"id":[]}]}',candidates),[])
        self.assertEqual(ranking_items('{"moments":[]}'),[])
        self.assertIsNone(ranking_items('not JSON'))

    def test_fast_mode_prefers_useful_content_to_greetings(self):
        self.assertGreater(editorial_score('Dlaczego popełniasz ten błąd? Wystarczy jeden krok.')[0],
                           editorial_score('Dzień dobry, witajcie, subskrybujcie kanał, link w opisie.')[0])

    def test_missing_word_times_are_never_invented(self):
        source=transcript('To jest krótki test.')
        source['segments'][0]['words'][1].update(start=None,end=None)
        candidates=build_candidates(validate_analysis({'transcript':source,'minDuration':5,'maxDuration':20,'engine':'fast'}))
        self.assertEqual(candidates[0]['start'],0)
        self.assertIn('jest',candidates[0]['text'])

    def test_invalid_input_and_ranges_are_rejected(self):
        source=transcript('Test danych.')
        source['segments'][0]['words'][0]['start']=float('nan')
        with self.assertRaises(ValueError):validate_analysis({'transcript':source})
        for start,end in [(10,9),(0,float('inf')),(0,200)]:
            with self.assertRaises(ValueError):validate_export({'clips':[{'id':'x','start':start,'end':end}]})

    def test_clipping_captions_preserves_relative_word_clock(self):
        payload={'settings':{},'cues':[{'start':100,'end':103,'words':[
            {'text':'pierwsze','start':100,'end':101},{'text':'2014','start':None,'end':None},
            {'text':'drugie','start':101.5,'end':102.5}]}]}
        result=cut_captions(payload,100.75,102)
        cue=result['cues'][0]
        self.assertEqual((cue['start'],cue['end']),(0,1.25))
        self.assertEqual((cue['words'][0]['start'],cue['words'][0]['end']),(0,.25))
        self.assertIsNone(cue['words'][1]['start'])
        self.assertEqual((cue['words'][2]['start'],cue['words'][2]['end']),(.75,1.25))
        self.assertEqual(payload['cues'][0]['words'][2]['start'],101.5)


if __name__=='__main__':unittest.main()
