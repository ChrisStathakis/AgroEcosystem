from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('profiles', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='profile',
            name='dropbox_account',
            field=models.CharField(blank=True, default='', help_text='Connected Dropbox account label.', max_length=255),
        ),
        migrations.AddField(
            model_name='profile',
            name='dropbox_last_sync',
            field=models.DateTimeField(blank=True, help_text='When the last manual Dropbox upload succeeded.', null=True),
        ),
        migrations.AddField(
            model_name='profile',
            name='dropbox_refresh_token',
            field=models.TextField(blank=True, default='', help_text='Dropbox OAuth refresh token for manual backup uploads.'),
        ),
    ]
