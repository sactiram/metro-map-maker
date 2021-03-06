# Generated by Django 2.1.7 on 2019-02-23 23:53

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('map_saver', '0009_savedmap_naming_token'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='savedmap',
            options={'permissions': (('hide_map', "Can set a map's gallery_visible to hidden"), ('name_map', "Can set a map's name"), ('tag_map', 'Can change the tags associated with a map'), ('generate_thumbnail', 'Can generate thumbnails for a map'))},
        ),
    ]
