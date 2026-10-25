import unittest
from backend.caption_export import validate_payload, build_ass, ass_time, escape_text, caption_layout, PRESETS


def payload():
    return {"settings":{"preset":"box-red","size":6.5,"position":"bottom","animated":True},"cues":[
        {"start":3601.123,"end":3602.1,"breakAfter":-1,"words":[
            {"text":"Dzień","start":3601.123,"end":3601.4},
            {"text":"2014","start":None,"end":None},
            {"text":"dobry","start":3601.8,"end":3602.1}]}]}


class CaptionTests(unittest.TestCase):
    def test_absolute_source_clock_and_red_colour_survive_export(self):
        document=build_ass(validate_payload(payload()),1920,1080,4000)
        self.assertIn('1:00:01.12',document)
        self.assertIn('1:00:02.10',document)
        self.assertIn('\\1c&H5C4BFF&',document)
        self.assertIn('2014',document)
        self.assertIn('\\t(0,120,\\fscx100\\fscy100)',document)

    def test_override_tags_in_transcribed_text_cannot_inject_ass_commands(self):
        self.assertEqual(escape_text(r'{\pos(1,2)}'), '｛＼pos(1,2)｝')

    def test_invalid_style_or_time_is_rejected(self):
        bad=payload();bad['settings']['preset']='arbitrary-filter'
        with self.assertRaises(ValueError):validate_payload(bad)
        bad=payload();bad['cues'][0]['words'][0]['end']=9000
        with self.assertRaises(ValueError):validate_payload(bad)

    def test_time_rounding_does_not_accumulate_across_words(self):
        self.assertEqual(ass_time(3600.126),'1:00:00.13')
        self.assertEqual(ass_time(59.999),'0:01:00.00')

    def test_custom_position_and_new_templates_survive_export(self):
        for preset in PRESETS:
            data=payload(); data['settings'].update(preset=preset,x=.3,y=.4,width=.4,size=12,position='custom')
            document=build_ass(validate_payload(data),1920,1080,4000)
            self.assertIn(r'\pos(576.00,432.00)',document)
            self.assertIn('\\1c&H'+PRESETS[preset]+'&',document)

    def test_wrap_matches_preview_at_narrow_width(self):
        cue={'words':[{'text':word} for word in ['To','jest','bardzo','ważny','test']]}
        self.assertEqual(caption_layout(cue,960,540,10,.88)[1],[3])
        self.assertEqual(caption_layout(cue,960,540,10,.3)[1],[1,2,3])

    def test_invalid_geometry_rejected(self):
        for key,value in [('x',float('nan')),('y',2),('width',.01),('size',30)]:
            data=payload();data['settings'][key]=value
            with self.assertRaises(ValueError):validate_payload(data)


if __name__=='__main__':unittest.main()
